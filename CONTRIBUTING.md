# Contributing to Zettel

Danke fürs Interesse! Zettel ist ein kleines OSS-Projekt — Patches, Bug-Reports und Vorschläge sind willkommen.

## Setup

### Voraussetzungen

- **Node.js ≥ 20** + **pnpm**
- **Rust stable** (`rustup default stable`)
- **Tauri-System-Deps** für deine Plattform: <https://tauri.app/start/prerequisites/>
- **Python 3.12** (für den PDF-Sidecar)
- **GTK3-Runtime** (nur Windows): <https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer/releases/latest>
- **Pango / Cairo / gdk-pixbuf** (Linux/macOS):
  - `sudo apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0`
  - `brew install pango cairo gdk-pixbuf`

### Erstes Setup

```bash
git clone https://github.com/jonax1337/zettel
cd zettel
pnpm install

# Python-Sidecar
cd sidecar
python -m venv .venv
# Windows:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate
pip install -r requirements.txt
cd ..

pnpm tauri:dev
```

Beim ersten Start wird die SQLite-DB im OS-AppData-Verzeichnis angelegt (`%APPDATA%\digital.laux.zettel\` auf Windows, `~/Library/Application Support/digital.laux.zettel/` auf macOS, `~/.local/share/digital.laux.zettel/` auf Linux).

### Sandbox-Modus

Zum Ausprobieren ohne Echtdaten: in Settings → Erweitert den Sandbox-Modus aktivieren. Eine separate DB (`zettel-sandbox.db`) wird verwendet, ein Banner ist in der App sichtbar.

## Architektur in 60 Sekunden

- **Frontend** (`src/`) — Svelte 5 (Runes), hash-Routing via `svelte-spa-router`, Bits UI als Component-Layer.
- **Persistenz** (`src/lib/db/`) — SQLite direkt über `@tauri-apps/plugin-sql`. Schema-Typen in `schema.ts` (Drizzle, nur compile-time), Queries als raw parameterized SQL in den Domain-Modulen (`invoices.ts`, `expenses.ts`, …). Migrations in `migrations/*.sql` werden compile-time in `src-tauri/src/lib.rs` via `include_str!` eingebettet.
- **Rust-Backend** (`src-tauri/src/`) — Tauri-Commands, Sidecar-Bridge (`sidecar.rs`), Backup (`backup.rs`), Crypto (`crypto.rs`), Sandbox (`sandbox.rs`).
- **Python-Sidecar** (`sidecar/`) — JSON-RPC über stdin/stdout. Rendert HTML via Jinja2 + WeasyPrint, bettet ZUGFeRD-XML via `factur-x` in PDF/A-3 ein, parsed eingehende PDFs via `factur-x.extract` und `pypdf`.

Vollständige Details und Konventionen: [`CLAUDE.md`](./CLAUDE.md).

## Konventionen

- **Svelte 5 Runes only** — keine `export let`, keine Legacy-Stores in Komponenten.
- **TypeScript strict** — keine `any` ohne sehr guten Grund.
- **UI-Wrapper unter `src/lib/ui/`** nicht umgehen — erweitern statt parallele Components bauen.
- **Deutsche UI-Strings**, englischer Code/Identifier/Comments.
- **Geld immer als Cent-Integer** in der DB. Konvertierung via `src/lib/utils/money.ts`.
- **DB-Naming:** `snake_case` in SQL, `camelCase` in TS via `mapXxx()`-Helper in den Query-Modulen.
- **Kommentare nur, wenn das WARUM nicht offensichtlich ist** — keine Was-Erklärungen.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **Keine zusätzlichen Webview-Windows** — alle Form-/Edit-Screens via `push("/...")` In-App-Routing.

### Migrationen

Eine neue Migration `000N_<name>.sql` braucht **vier** synchrone Änderungen — sonst bricht der Restore-Pfad:

1. `PRAGMA user_version = <N+1>;` am Ende der neuen Migration.
2. `CURRENT_SCHEMA` in `src-tauri/src/backup.rs` bumpen.
3. `CURRENT_DB_SCHEMA_VERSION` in `src/routes/settings/{Advanced,Data}.svelte`.
4. `Migration { version, description, sql: include_str!(...) }` in `build_migrations()` in `lib.rs`.

**Migrationen sind nach Shipping unveränderlich** — Inhalt ändern = neue Migration. `.gitattributes` pinnt LF für `*.sql`, weil `include_str!` byte-stabil über Plattformen sein muss.

## Tests

- **Vitest:** `pnpm test` — pure TypeScript-Logik (`tax/`, `utils/money`, `utils/invoice-number`, `export/datev`).
- **svelte-check:** `pnpm check` vor jedem PR.
- **Sidecar:** `cd sidecar && pytest` — Smoke-Tests und Extraktions-Heuristiken.
- **ZUGFeRD-Validierung:** Beim Ändern von `sidecar/templates/zugferd-en16931.xml.j2` immer mindestens eine erzeugte PDF gegen [erechnungs-validator.de](https://erechnungs-validator.de) oder den lokal gebundelten KoSIT-Validator prüfen und das Ergebnis im PR posten.

## Pull Requests

1. Fork & Branch (`feat/short-name` oder `fix/short-name`), Ziel ist der aktuelle `release/vX.Y`-Branch, nicht `main`.
2. Kleine, fokussierte Commits — Conventional-Commits-Style.
3. PR-Beschreibung: Was, Warum, ggf. Screenshots bei UI-Änderungen.
4. Bei XML-/PDF-Änderungen: Validator-Ergebnis als Screenshot oder Text im PR posten.
5. CI muss grün sein (siehe `.github/workflows/build.yml`).
6. Bei neuen Konventionen: [`CLAUDE.md`](./CLAUDE.md) entsprechend anpassen.

## Was wir aktuell suchen

Issues mit Label [`good first issue`](https://github.com/jonax1337/zettel/issues?q=is%3Aopen+label%3A%22good+first+issue%22) und [`help wanted`](https://github.com/jonax1337/zettel/issues?q=is%3Aopen+label%3A%22help+wanted%22). Größere Roadmap-Themen werden in [Discussions](https://github.com/jonax1337/zettel/discussions) vorbesprochen — vor dem PR bitte dort melden, damit wir nicht aneinander vorbeiarbeiten.

## Non-Goals

Bitte vor Feature-Requests checken, dass dein Vorschlag kein explizites Non-Goal ist (siehe Abschnitt „Was Zettel nicht ist" in der [README](./README.md#was-zettel-nicht-ist)):

- Vollständige Buchhaltung / Konten-Plan / Jahresabschluss
- Banking / Kontoabgleich
- ELSTER-Upload, UStVA-Versand
- Cloud-Sync, Mobile-App
- SMTP-Versand der Rechnungen
- Scan-OCR (Tesseract)
- Telemetrie

## Code of Conduct

Sei freundlich. Siehe [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Lizenz

Mit deinem Beitrag stimmst du zu, dass deine Änderungen unter MIT lizenziert werden.
