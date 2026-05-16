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
git tag v0.4.1
git push --tags
```

CI builds signed artifacts for Windows / macOS / Linux, the `release` job assembles `latest.json` from the `.sig` files, and the draft GitHub Release ends up with both the installers and `latest.json` attached. Publishing the draft makes the feed live at:

```
https://github.com/jonax1337/zettel/releases/latest/download/latest.json
```

which is the endpoint configured in `tauri.conf.json`.

## How it behaves at runtime

- 10 seconds after the app mounts, `src/App.svelte` calls `checkForUpdate()` (no-op outside Tauri).
- If a newer version is found, a toast with an "Installieren" action appears. Click → `downloadAndInstall()` + `relaunch()`.
- Settings → "Updates" → "Nach Updates suchen" triggers the same check on demand.
- All other failure modes (offline, no key, malformed feed) are silently swallowed on startup — only the manual button surfaces errors.

## Don'ts

- **Never** commit the private key or check the pubkey replacement into a branch that ships before the secrets are in place.
- **Never** rotate the pubkey without shipping a transitional version that still uses the old one. Once users have v0.4.x installed with pubkey A, only updates signed by A can install. Rotating means cutting a new install (not an update).
