# Auto-Update Setup

One-time maintainer steps to enable Tauri's auto-updater for Zettel. The feature is fully wired in code; only the signing key plumbing must be done by hand (Anthropic-shaped private keys never end up in this repo).

## TL;DR

1. Generate an Ed25519 keypair locally.
2. Add the private key + password as GitHub Secrets.
3. Replace the placeholder pubkey in `src-tauri/tauri.conf.json` and commit.
4. Cut a tag — CI signs artifacts and uploads `latest.json` to the GitHub Release.

Until step 3 is complete, `pnpm tauri build` will fail (the placeholder is intentionally invalid). That is the tripwire.

## Step 1 — Generate the keypair

```bash
pnpm tauri signer generate -w ~/.tauri/zettel-signing.key
```

The CLI prompts for a password — **use one** and store it in a password manager. The command produces:

- `~/.tauri/zettel-signing.key` — the encrypted private key file.
- A printed **public key** (the long base64 blob) — printed once, copy it.

## Step 2 — GitHub Secrets

Repo → Settings → Secrets and variables → Actions → New repository secret:

- `TAURI_SIGNING_PRIVATE_KEY` — paste the **entire content** of `~/.tauri/zettel-signing.key` (including the `untrusted comment` header).
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password chosen in step 1.

The `Build` workflow already passes both vars into `tauri build` (see `.github/workflows/build.yml`).

## Step 3 — Wire the public key

Open `src-tauri/tauri.conf.json` and replace `PLACEHOLDER_REPLACE_WITH_OUTPUT_OF_TAURI_SIGNER_GENERATE` with the public key from step 1. Commit:

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore(updater): wire signing pubkey"
```

## Step 4 — Tag a release

```bash
pnpm version:set X.Y.Z        # on main, commit
git tag vX.Y.Z
git push origin vX.Y.Z
```

CI builds signed artifacts for Windows / macOS / Linux, the `release` job assembles `latest.json` from the `.sig` files, and the draft GitHub Release ends up with both the installers and `latest.json` attached. Publishing the draft makes the feed live at:

```
https://github.com/jonax1337/zettel/releases/latest/download/latest.json
```

which is the endpoint configured in `tauri.conf.json`.

## Publishing the draft (release gate)

`build.yml` always creates a **draft**, so nothing reaches clients until you publish it by hand. Check the draft first:

1. **Assets.** A stable release has 9: `Zettel_<v>_x64_en-US.msi` + `.sig`, `Zettel_<v>_x64-setup.exe` + `.sig`, `Zettel_<v>_aarch64.dmg`, `Zettel.app.tar.gz` + `.sig`, `Zettel_<v>_amd64.deb`, `latest.json`. A release candidate has 7: the same without the MSI and its `.sig` (WiX cannot build `-rc` versions).
2. **`latest.json`.** `version` equals the tag without the `v`; `platforms` contains `windows-x86_64` and `darwin-aarch64`, each with a non-empty `signature` and a `url` pointing at this release. There is no `linux-x86_64` entry: Linux builds only a `.deb`, which has no updater artifact.
3. **Publish.** Stable: `gh release edit vX.Y.Z --draft=false`. Release candidate: `gh release edit vX.Y.Z-rc.N --draft=false --prerelease --latest=false` (the draft already carries the pre-release flag; this keeps it that way).
4. **Verify.** Publishing triggers `update-feed.yml`; wait for the run to finish, then check:
   - `gh release view --json tagName` still names the newest *stable* release (an RC must never become "Latest").
   - `releases/download/beta-feed/latest.json` shows the new version (the feed only moves forward: a candidate that is not newer than the current feed is skipped).

If a tag build fails during setup with a message like `configuration … not supported`, GitHub has retired the runner image named in the `build.yml` matrix (`runs-on`): bump it to the current image and re-run. The same applies to `ci.yml`.

## How it behaves at runtime

- 10 seconds after the app mounts, `src/App.svelte` calls `checkForUpdate()` (no-op outside Tauri).
- If a newer version is found, a toast with an "Installieren" action appears. Click → `downloadAndInstall()` + `relaunch()`.
- Settings hub → "Nach Updates suchen" triggers the same check on demand.
- All other failure modes (offline, no key, malformed feed) are silently swallowed on startup — only the manual button surfaces errors.

## Channels (stable / beta)

The check runs through the Rust command `check_for_update(channel)` (`src-tauri/src/updates.rs`), because the plugin's JS `check()` cannot switch endpoints. The frontend wraps the result in the plugin's `Update` class, so download and install use the regular plugin commands.

| Channel | Feed | Contains |
|---|---|---|
| `stable` (default) | `releases/latest/download/latest.json` (from `tauri.conf.json`) | newest non-pre-release only |
| `beta` (Settings → "Beta-Updates") | `releases/download/beta-feed/latest.json` | newest published release, pre-releases included |

The choice lives in `localStorage` (`zettel.update_channel`). Without a stored choice, a pre-release install (`-rc.N`) defaults to beta. Leaving beta never downgrades: the app stays on the installed RC until a newer stable version exists (`0.23.0` > `0.23.0-rc.2`).

`beta-feed` is a rolling pre-release that `.github/workflows/update-feed.yml` maintains: on every `release: published` it copies that release's `latest.json` into `beta-feed`, but only if its version is newer than the feed's. It is created on the first publish. To repair it by hand, run the workflow via `workflow_dispatch` with a tag. Do not delete the `beta-feed` release.

## Release candidates

1. On `release/vX.Y`: `pnpm version:set X.Y.0-rc.N`, commit, push.
2. Tag the commit: `git tag vX.Y.0-rc.N && git push origin vX.Y.0-rc.N`.
3. `build.yml` checks that the tag matches all manifests and lies on `release/vX.Y`, builds (Windows: NSIS only — WiX/MSI rejects non-numeric pre-release versions) and creates a **draft pre-release** that is never marked "latest".
4. Publish the draft → `update-feed.yml` moves the beta feed → beta users get the RC.

Stable tags must sit on `main`. As a second line of defence, the stable channel ignores any feed entry with a pre-release version, so an RC draft published without the pre-release flag still never reaches stable installs.

Caveats:
- `update-feed.yml` runs from the tagged commit's copy of the workflow, so it only fires for tags that contain it (v0.23.0-rc.1 onward). `workflow_dispatch` repair is only offered once the file is on `main`. If the workflow fails, beta users miss that release until it is re-run.
- Linux `.deb`: dpkg reads `0.23.0-rc.1` as Debian revision `rc.1` and sorts it *above* `0.23.0`, so installing the stable `.deb` over an RC needs `apt install --allow-downgrades`. Linux has no auto-update entry, so this only affects manual installs.

## Don'ts

- **Never** commit the private key or check the pubkey replacement into a branch that ships before the secrets are in place.
- **Never** rotate the pubkey without shipping a transitional version that still uses the old one. Once users have v0.4.x installed with pubkey A, only updates signed by A can install. Rotating means cutting a new install (not an update).
