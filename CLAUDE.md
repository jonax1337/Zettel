# Zettel — Claude Code Context

## What this is
Offline-first invoice generator (Tauri 2 + Svelte 5 + Python sidecar) for German freelancers / Kleinunternehmer. ZUGFeRD/Factur-X PDF/A-3 output. Full plan in `PLAN.md`.

## Current state
Through **M5 (cross-platform builds)**: customer/invoice CRUD with status workflow, Python sidecar producing PDF/A-3 with embedded EN 16931 Factur-X XML, logo upload, ZUGFeRD-profile selector in Settings (only EN 16931 wired in v0.1; BASIC/EXTENDED disabled). 5 invoices validated successfully against erechnungs-validator.de. GitHub Actions matrix workflow for Win/macOS/Linux exists but has not run yet. Output at `~/Documents/Zettel/Rechnungen/<RE-...>.pdf`. M6 (public OSS release, demo GIF, issue templates) remains.

## Sidecar
- **Dev:** Python script at `sidecar/main.py`, spawned by Rust per command (`std::process::Command`), JSON over stdin/stdout. See `src-tauri/src/sidecar.rs` and `src/lib/sidecar/invoice.ts`.
- **Release:** PyInstaller-bundled `zettel-sidecar(.exe)` shipped as a Tauri resource (`bundle.resources` in `tauri.conf.json` → `../sidecar/dist/zettel-sidecar` → `<resource_dir>/sidecar/`). `sidecar.rs` picks dev vs. release via `cfg!(debug_assertions)`.
- Build the bundle: `cd sidecar && python build.py` (needs `pyinstaller==6.11.1` in the venv). On Windows, **every** `.dll` from the GTK3-Runtime install dir is copied next to the exe — different GTK builds version libs differently (gtk3-classic ships libffi-7/libtiff-5, official MSI ships -8/-6), so we don't maintain an allow-list.
- Python interpreter resolution (dev only): `ZETTEL_PYTHON` env, `sidecar/.venv/Scripts/python.exe` (Win) or `.../bin/python` (Unix), then `python` from PATH.
- GTK lookup (`main.py:_add_gtk_dll_path`): in frozen mode, the exe's own directory is searched first (since `build.py` co-locates the DLLs there), then `C:\Program Files\GTK3-Runtime Win64\…`, then msys64. Override with `ZETTEL_GTK_PATH`.
- ZUGFeRD XML rendered from `sidecar/templates/zugferd-en16931.xml.j2` (Jinja with `autoescape=True` — `select_autoescape` doesn't match `.xml.j2` since it inspects only the last extension), then embedded into PDF/A-3 via `factur-x.generate_from_binary(level=payload.profile or "en16931")`.
- **Kleinunternehmer quirk** (BR-CO-26): if `company.vatId` is absent, the template emits `taxNumber` as `<ram:ID>` (BT-29) inside `<ram:SellerTradeParty>` so the seller-identification rule is satisfied even without a VAT-ID.
- **Logo handling:** `pdf.py:_logo_data_uri` reads `company.logoPath` from disk and inlines it as a `data:` URI before rendering. Avoids WeasyPrint base-URL resolution against arbitrary user paths.

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
- **Bits UI defaults** — do NOT build a custom design system in M1. Functionality > polish.
- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`). No legacy stores in components, no `export let`. New components: `<script lang="ts">` with runes.
- **German UI strings**, English code/identifiers/comments.
- **No comments unless WHY is non-obvious.**
- **Customer/Invoice numbers**: `K-0001`, `RE-2026-0001`. Format configurable in settings.
- **DB column naming**: snake_case in SQL, mapped to camelCase in TS via `mapXxx()` helpers in `queries.ts`.

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
