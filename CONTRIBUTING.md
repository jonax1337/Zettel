# Contributing to Zettel

Danke fürs Interesse! Zettel ist ein kleines OSS-Projekt — Patches und Vorschläge sind willkommen.

## Setup

### Voraussetzungen

- **Node.js ≥ 20** und **pnpm**
- **Rust stable** (`rustup default stable`)
- **Tauri-Voraussetzungen** für deine Plattform: https://tauri.app/start/prerequisites/
- **Python 3.12** (für den PDF-Sidecar)
- **GTK3-Runtime** (nur auf Windows): https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases/latest
- **Pango/Cairo** (Linux/macOS): `sudo apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0` bzw. `brew install pango cairo gdk-pixbuf`

### Erstes Setup

```bash
git clone https://github.com/jonax1337/zettel
cd zettel
pnpm install

# Python-Sidecar
cd sidecar
py -3.12 -m venv .venv         # Windows
# python3.12 -m venv .venv     # macOS/Linux
.\.venv\Scripts\Activate.ps1   # Windows
# source .venv/bin/activate    # macOS/Linux
pip install -r requirements.txt
cd ..

pnpm tauri:dev
```

Beim ersten Start wird die SQLite-Datenbank im OS-AppData-Verzeichnis angelegt.

## Architektur in 60 Sekunden

- **Frontend** (`src/`): Svelte 5 mit Runes (`$state`/`$derived`/`$effect`/`$props`), `svelte-spa-router` für hash-Routing, Bits UI für Components.
- **Persistenz** (`src/lib/db/`): SQLite via `@tauri-apps/plugin-sql`. Schema in `schema.ts` (Drizzle, nur Typen), Queries als raw parameterized SQL in `queries.ts`. Migrations in `migrations/` werden compile-time in `src-tauri/src/lib.rs` eingebettet.
- **Rust-Backend** (`src-tauri/src/`): Bridge zum Sidecar (`sidecar.rs`), Tauri-Commands.
- **Python-Sidecar** (`sidecar/`): JSON-RPC über stdin/stdout. Rendert HTML via Jinja2 + WeasyPrint, bettet ZUGFeRD-XML via `factur-x` in PDF/A-3 ein.

Vollständige Details: [`CLAUDE.md`](./CLAUDE.md).

## Konventionen

- **Svelte 5 Runes only** — keine `export let`, keine Legacy-Stores in Komponenten.
- **TypeScript strict** — keine `any` ohne sehr gutem Grund.
- **Bits UI Defaults** — keine eigenen Design-System-Komponenten. Funktionalität vor Optik.
- **Deutsche UI-Strings**, englischer Code/Identifier/Comments.
- **Geld immer in Cent als Integer** in der DB. Format-Konvertierung über `src/lib/utils/money.ts`.
- **DB-Spalten:** `snake_case` in SQL, `camelCase` in TS via `mapXxx()`-Helper in `queries.ts`.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).

## Tests

- **Sidecar-Smoke-Test:** `Get-Content sidecar/test-payloads/01-standard-19.json -Raw | python sidecar/main.py` (Windows) — sollte JSON mit `success: true` returnen.
- **ZUGFeRD-Validierung:** Beim Ändern des XML-Templates (`sidecar/templates/zugferd-en16931.xml.j2`) immer mindestens ein erzeugtes PDF gegen [erechnungs-validator.de](https://erechnungs-validator.de) prüfen.
- **`pnpm check`** — svelte-check vor jedem Commit.

## Pull Requests

1. Fork & Branch (`feat/short-name` oder `fix/short-name`)
2. Kleine, fokussierte Commits.
3. PR-Beschreibung: Was, Warum, ggf. Screenshots bei UI-Änderungen.
4. Bei XML-/PDF-Änderungen: Validator-Ergebnis als Screenshot oder Text in PR posten.
5. CI muss grün sein (siehe `.github/workflows/build.yml`).

## Was wir aktuell suchen

Siehe Issues mit Label `good first issue` und `help wanted`. Größere Brocken aus [`PLAN.md`](./PLAN.md):

- BASIC- und EXTENDED-XML-Templates für ZUGFeRD-Profil-Wahl
- DATEV-Export (Phase 2)
- Eingangsrechnungen einlesen (ZUGFeRD-XML extrahieren, Phase 2)
- Backup/Restore (Phase 2)
- I18n (englische UI, Phase 2)

## Code of Conduct

Sei freundlich. Siehe [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Lizenz

Mit deinem Beitrag stimmst du zu, dass deine Änderungen unter MIT lizenziert werden.
