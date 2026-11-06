# Contributing to Zettel

Danke fürs Interesse! Zettel ist ein kleines OSS-Projekt — Patches, Bug-Reports und Vorschläge sind willkommen.

## Setup

### Voraussetzungen

- **Node.js ≥ 22.12** + **pnpm**
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

Beim ersten Start wird die SQLite-DB im OS-AppData-Verzeichnis angelegt (`%APPDATA%\digital.laux.zettel\` auf Windows, `~/Library/Application Support/digital.laux.zettel/` auf macOS, `~/.config/digital.laux.zettel/` auf Linux; dort liegen auch `sandbox.flag` und `tenants.json` unter `~/.local/share/digital.laux.zettel/`). PDFs und Backups landen unter `<Dokumente>/Zettel`.

### Sandbox-Modus

Zum Ausprobieren ohne Echtdaten: in Settings → Daten den Sandbox-Modus aktivieren. Eine separate DB (`zettel-sandbox.db`) wird verwendet, ein Banner ist in der App sichtbar.

## Architektur in 60 Sekunden

- **Frontend** (`src/`) — Svelte 5 (Runes), hash-Routing via `svelte-spa-router`, Bits UI als Component-Layer.
- **Persistenz** (`src/lib/db/`) — SQLite direkt über `@tauri-apps/plugin-sql`. Schema-Typen in `schema.ts` (Drizzle, nur compile-time), Queries als raw parameterized SQL in den Domain-Modulen (`invoices.ts`, `expenses.ts`, …). Migrations in `migrations/*.sql` werden compile-time in `src-tauri/src/lib.rs` via `include_str!` eingebettet.
- **Rust-Backend** (`src-tauri/src/`) — Tauri-Commands, Sidecar-Bridge (`sidecar.rs`), E-Rechnungs-Validierung über Java/KoSIT (`validator.rs`), Mail-Übergabe an das lokale Mail-Programm (`mail.rs`), Mandanten und Dokumente-Root (`tenants.rs`), Update-Kanäle (`updates.rs`), Backup (`backup.rs`), Crypto (`crypto.rs`), Sandbox (`sandbox.rs`).
- **Python-Sidecar** (`sidecar/`) — JSON-RPC über stdin/stdout. Rendert HTML via Jinja2 + WeasyPrint, bettet ZUGFeRD-XML via `factur-x` in PDF/A-3 ein, erzeugt XRechnung-XML, parsed eingehende PDFs via `factur-x.extract` und `pypdf`, liest CAMT.053-/MT940-Kontoauszüge.
- **CLI** (`cli/zettel.py`) — headless-Zugriff auf dieselbe DB; spiegelt Teile der App-Logik, siehe [`cli/README.md`](./cli/README.md).

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
3. `CURRENT_DB_SCHEMA_VERSION` in `src/lib/utils/schema-version.ts`.
4. Eine Zeile `(version, "beschreibung", "000N_<name>")` im `up_migrations!`-Makro in `build_migrations()` in `lib.rs`.

Fügt eine Migration eine Spalte zu einer auditierten Tabelle hinzu (Liste in `tools/gen_audit_triggers.py`), müssen die Audit-Trigger dieser Tabelle in derselben Migration neu erzeugt werden; der Test `src/lib/db/audit-log.test.ts` schlägt sonst fehl.

**Migrationen sind nach Shipping unveränderlich** — Inhalt ändern = neue Migration. `.gitattributes` pinnt LF für `*.sql`, weil `include_str!` byte-stabil über Plattformen sein muss.

## Tests

- **Vitest:** `pnpm test` — pure TypeScript-Logik (`tax/`, `utils/money`, `utils/invoice-number`, `export/datev`, …) und DB-Tests gegen eine echte, migrierte SQLite-DB (`src/lib/db/sqlite-test-db.ts`, z. B. Migrationen, Audit-Trigger, Siegel, Restore).
- **svelte-check:** `pnpm check` vor jedem PR.
- **Sidecar:** `cd sidecar && pytest` — ZUGFeRD-/XRechnung-XML-Goldens, KoSIT-Validator-Roundtrip (braucht `tools/kosit-validator`, siehe `tools/download-validator.sh`; ohne ihn werden diese Tests übersprungen), i18n, Extraktions-Heuristiken und die CLI (inkl. Parität zur App über `sidecar/tests/fixtures/invoice-parity.json` und Siegel-Format über `invoice-seal.json`, beide auch von Vitest geprüft).
- **Rust:** in `src-tauri/`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --lib`.
- **ZUGFeRD-Validierung:** Beim Ändern von `sidecar/templates/zugferd-en16931.xml.j2` immer mindestens eine erzeugte PDF gegen [erechnungs-validator.de](https://erechnungs-validator.de) oder den lokal gebundelten KoSIT-Validator prüfen und das Ergebnis im PR posten.

## Pull Requests

1. Fork & Branch (`feat/short-name` oder `fix/short-name`), Ziel ist der aktuelle `release/vX.Y`-Branch, nicht `main`.
2. Kleine, fokussierte Commits — Conventional-Commits-Style.
3. PR-Beschreibung: Was, Warum, ggf. Screenshots bei UI-Änderungen.
4. Bei XML-/PDF-Änderungen: Validator-Ergebnis als Screenshot oder Text im PR posten.
5. CI muss grün sein (Check „CI ok", siehe `.github/workflows/ci.yml`).
6. Bei neuen Konventionen: [`CLAUDE.md`](./CLAUDE.md) entsprechend anpassen.

## Releases (Maintainer)

Versionen folgen SemVer und stehen in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` und `Cargo.lock` — nie von Hand ändern, sondern `pnpm version:set <version>`. CI prüft, dass alle vier übereinstimmen und zum Tag passen.

**Release Candidate** (Beta-Kanal), vom Release-Branch:

```bash
git switch release/v0.23
pnpm version:set 0.23.0-rc.1
git commit -am "chore(release): v0.23.0-rc.1"
git push
git tag v0.23.0-rc.1 && git push origin v0.23.0-rc.1
```

Der Tag muss auf einem Commit in `release/vX.Y` liegen, sonst bricht der Build ab. CI baut einen **Draft** mit Pre-Release-Flag (Windows nur NSIS, weil MSI keine `-rc`-Versionen kann). Draft veröffentlichen → `update-feed.yml` aktualisiert den Beta-Feed, Nutzer mit „Beta-Updates" bekommen das Update. Stabile Nutzer sehen Pre-Releases nie.

**Stabiles Release:** `release/vX.Y → main` mergen, auf `main` `pnpm version:set X.Y.0`, taggen `vX.Y.0`, Draft veröffentlichen. Der Draft erreicht erst nach dem manuellen Veröffentlichen Clients; vorher Assets und `latest.json` prüfen. Checkliste und Details: [`docs/auto-update-setup.md`](./docs/auto-update-setup.md).

## Was wir aktuell suchen

Issues mit Label [`good first issue`](https://github.com/jonax1337/zettel/issues?q=is%3Aopen+label%3A%22good+first+issue%22) und [`help wanted`](https://github.com/jonax1337/zettel/issues?q=is%3Aopen+label%3A%22help+wanted%22). Größere Roadmap-Themen werden in [Discussions](https://github.com/jonax1337/zettel/discussions) vorbesprochen — vor dem PR bitte dort melden, damit wir nicht aneinander vorbeiarbeiten.

## Non-Goals

Bitte vor Feature-Requests checken, dass dein Vorschlag kein explizites Non-Goal ist (siehe Abschnitt „Was Zettel nicht ist" in der [README](./README.md#was-zettel-nicht-ist)):

- Vollständige Buchhaltung / Konten-Plan / Jahresabschluss
- Online-Banking-Anbindung (der lokale Import von CAMT.053-/MT940-Dateien existiert bereits)
- ELSTER-Upload, UStVA-Versand
- Cloud-Sync, Mobile-App
- SMTP-Versand der Rechnungen (Zettel übergibt PDF und Empfänger an das lokale Mail-Programm, siehe `mail.rs`; ein eigener Mailversand ist ein Non-Goal)
- Scan-OCR (Tesseract)
- Telemetrie

## Code of Conduct

Sei freundlich. Siehe [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Lizenz

Mit deinem Beitrag stimmst du zu, dass deine Änderungen unter MIT lizenziert werden.
