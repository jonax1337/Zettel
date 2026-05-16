# Zettel — Claude Code Context

## What this is
Offline-first invoice generator (Tauri 2 + Svelte 5 + Python sidecar) for German freelancers / Kleinunternehmer. ZUGFeRD/Factur-X PDF/A-3 output. Full plan in `PLAN.md`.

## Current state
**v0.2 release-ready** on `release/v0.2`. All planned v0.2 features merged:
- Reverse-Charge / intra-EU B2B (CategoryCode K) — toggle in `InvoiceEdit.svelte`, validated via both-parties-have-VAT-ID rule, ZUGFeRD `ExemptionReason "VAT exempt for EEA intra-community supply..."`, PDF hint "Steuerschuldnerschaft des Leistungsempfängers".
- **BASIC + EXTENDED ZUGFeRD profiles** active (URN is parametrized via `{{ guideline_urn }}` in the template, picked in `zugferd.py:_PROFILE_URNS`).
- **DATEV-Export** (`/export` route, `src/lib/export/datev.ts`): Buchungsstapel Format 700, SKR03/SKR04, one row per VAT-rate-group per invoice. Written via the Rust `save_text_file` command — avoids `plugin-fs` dep.
- **Backup / Restore** (`src-tauri/src/backup.rs`): ZIP of SQLite snapshot (via `VACUUM INTO` over the live connection) + PDFs + `manifest.json`. Restore is **staged**: extracted to `<appdata>/pending_restore/` + marker file, then `apply_pending_restore_blocking()` runs in `lib.rs:run()` BEFORE the SQL plugin opens the DB.
- **Recurring invoices** (`/recurring`, `src/lib/db/recurring.ts`): monthly/quarterly/yearly templates, "Jetzt erzeugen" creates a fresh draft via `createInvoice` + bumps `next_due_date`. No background scheduler — manual confirmation per invoice. Dashboard widget "Fällige Vorlagen" surfaces due ones.
- `.gitattributes` pins LF for all code files — `include_str!` migrations must be byte-stable across platforms.

v0.1 status preserved on `main`: M1–M5 done, 5/5 invoices validated against erechnungs-validator.de, Windows MSI+NSIS shipped. Output path unchanged: `~/Documents/Zettel/Rechnungen/<RE-...>.pdf`.

## Sidecar
- **Dev:** Python script at `sidecar/main.py`, spawned by Rust per command (`std::process::Command`), JSON over stdin/stdout. See `src-tauri/src/sidecar.rs` and `src/lib/sidecar/invoice.ts`.
- **Release:** PyInstaller-bundled `zettel-sidecar(.exe)` shipped as a Tauri resource (`bundle.resources` in `tauri.conf.json` → `../sidecar/dist/zettel-sidecar` → `<resource_dir>/sidecar/`). `sidecar.rs` picks dev vs. release via `cfg!(debug_assertions)`.
- Build the bundle: `cd sidecar && python build.py` (needs `pyinstaller==6.11.1` in the venv). On Windows, **every** `.dll` from the GTK3-Runtime install dir is copied next to the exe — different GTK builds version libs differently (gtk3-classic ships libffi-7/libtiff-5, official MSI ships -8/-6), so we don't maintain an allow-list.
- Python interpreter resolution (dev only): `ZETTEL_PYTHON` env, `sidecar/.venv/Scripts/python.exe` (Win) or `.../bin/python` (Unix), then `python` from PATH.
- GTK lookup (`main.py:_add_gtk_dll_path`): in frozen mode, the exe's own directory is searched first (since `build.py` co-locates the DLLs there), then `C:\Program Files\GTK3-Runtime Win64\…`, then msys64. Override with `ZETTEL_GTK_PATH`.
- ZUGFeRD XML rendered from `sidecar/templates/zugferd-en16931.xml.j2` (Jinja with `autoescape=True` — `select_autoescape` doesn't match `.xml.j2` since it inspects only the last extension), then embedded into PDF/A-3 via `factur-x.generate_from_binary(level=payload.profile or "en16931")`. The `GuidelineSpecifiedDocumentContextParameter` URN is parametrized via `{{ guideline_urn }}` and picked from `zugferd.py:_PROFILE_URNS` per `payload.profile` (basic / en16931 / extended).
- **Kleinunternehmer quirk** (BR-CO-26): if `company.vatId` is absent, the template emits `taxNumber` as `<ram:ID>` (BT-29) inside `<ram:SellerTradeParty>` so the seller-identification rule is satisfied even without a VAT-ID.
- **Logo handling:** `pdf.py:_logo_data_uri` reads `company.logoPath` from disk and inlines it as a `data:` URI before rendering. Avoids WeasyPrint base-URL resolution against arbitrary user paths.
- **Reverse-Charge:** when `invoice.isReverseCharge` is true, `CategoryCode K` + `ExemptionReason "VAT exempt for EEA intra-community supply of goods and services"` is written per line and in the document-level `ApplicableTradeTax`. Buyer-VAT-ID is in `<ram:SpecifiedTaxRegistration schemeID="VA">`.

## Rust-only modules (`src-tauri/src/`)
- `sidecar.rs` — spawns the Python sidecar (dev vs. release-bundled).
- `fs_export.rs` — `save_text_file(path, content)` for CSV exports without `plugin-fs`.
- `backup.rs` — `snapshot_db_path`, `bundle_backup`, `stage_restore` Tauri commands + `apply_pending_restore_blocking()` that runs in `run()` BEFORE plugin init so the SQL plugin opens the freshly-restored DB. Uses `zip` (deflate), `walkdir`, `dirs`. App identifier is hardcoded as `digital.laux.zettel` because the pre-builder hook has no AppHandle.

## Cross-platform builds
- `.github/workflows/build.yml` matrix: windows-latest, macos-14 (arm64), macos-13 (x86_64), ubuntu-22.04. Each runner installs Python+GTK+Tauri-deps, runs `python sidecar/build.py`, then `pnpm tauri build --target <triple>`. Artifacts uploaded; release job triggers on `v*` tag.
- **Linux/macOS caveat:** WeasyPrint loads Pango/Cairo dynamically from the system. Users need `apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0` or `brew install pango cairo gdk-pixbuf`. Bundling those is a Phase-2 nice-to-have.
- Local Windows install lands at `C:\Users\<user>\AppData\Local\zettel\` (NSIS user-scope).

## Stack quick-ref
- **Frontend:** Svelte 5 (runes!), TypeScript strict, Vite, Tailwind v4, Bits UI
- **Routing:** `svelte-spa-router` — hash-based, lightweight (no SvelteKit)
- **Persistence:** `@tauri-apps/plugin-sql` (SQLite). Schema in `src/lib/db/schema.ts` (Drizzle, types only). Queries are raw parameterized SQL via `src/lib/db/client.ts` — Drizzle ORM is **not** wired up at runtime. Migrations live in `src/lib/db/migrations/*.sql` and are embedded at compile-time in `src-tauri/src/lib.rs`.
- **Money:** always Cent (integer) in DB, format on display via `src/lib/utils/money.ts`.

## Conventions
- **UI lives in `src/lib/ui/`** — thin shadcn-style wrappers over Bits UI primitives (Button, Card, Dialog, Dropdown, Input, Select, Textarea, Badge, Titlebar, Toaster). Theme tokens in `src/lib/theme.svelte.ts` (light/dark/system). Lucide icons via `@lucide/svelte`. Do not bypass these wrappers — extend them.
- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`). No legacy stores in components, no `export let`. New components: `<script lang="ts">` with runes.
- **German UI strings**, English code/identifiers/comments.
- **No comments unless WHY is non-obvious.**
- **Customer/Invoice numbers**: `K-0001`, `RE-2026-0001`. Format configurable in settings.
- **DB column naming**: snake_case in SQL, mapped to camelCase in TS via `mapXxx()` helpers in `queries.ts` / `invoices.ts` / `recurring.ts`.
- **Migrations are byte-sensitive.** They're embedded via Rust `include_str!`. `.gitattributes` pins LF for all `*.sql` (and other code) files; never change a migration's content after it has shipped — bump the version and add a new one.

## Git workflow
- Feature work lands in `release/vX.Y` branches via PRs. main = last shipped release.
- Squash-merge PRs into the release branch; one consolidating PR `release/vX.Y → main` at release time.
- Conventional commits (`feat`, `fix`, `chore`, `docs`).
- All git/pnpm/gh/cargo commands run via PowerShell (Windows Tauri project). WSL bash is fine for `Read`/`Edit`/`Write` tools.

## Commands
- `pnpm tauri:dev` — full app (Tauri + Vite)
- `pnpm dev` — frontend only (no Tauri APIs available, DB calls fail)
- `pnpm db:generate` — regenerate migrations from Drizzle schema
- `pnpm check` — svelte-check

## Don't
- Don't add backend HTTP servers — everything is Tauri commands or direct SQLite.
- Don't introduce React, SvelteKit, or styled-components.
- Don't store money as float.
- Don't add telemetry.
