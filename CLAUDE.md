# Zettel — Claude Code Context

## What this is
Offline-first invoice generator (Tauri 2 + Svelte 5 + Python sidecar) for German freelancers / Kleinunternehmer. ZUGFeRD/Factur-X PDF/A-3 output. Full plan in `PLAN.md`.

## Current state
**v0.5.0 released** on `main` (2026-05-16). Auto-Update aktiv ab v0.4.3. `release/v0.12` ist die aktuelle Entwicklungslinie.

### v0.12.0 (in Arbeit) — Leistungszeiträume + lange Positionsbeschreibung
- **Leistungszeitraum auf Header-Ebene** (`invoices.service_period_start/end`, `offers.service_period_start/end`): EN-16931 BG-14 (BT-73/74). UI-Toggle „Einzeltag/Zeitraum" über dem Datumsfeld; wenn beide Period-Felder gesetzt sind gewinnt der Zeitraum, sonst Fallback auf `delivery_date` (BT-72).
- **Lange Positionsbeschreibung** (`*_items.long_description`): EN-16931 BT-154 (`SpecifiedTradeProduct/Description`) zusätzlich zu BT-153 `Name`. UI per „+ Detail-Beschreibung" pro Zeile aufklappbar.
- **Leistungsdatum/-zeitraum pro Position** (`*_items.line_period_start/end`): BG-26 (BT-134/135). Toggle pro Zeile zwischen Einzeltag und Zeitraum; bei Einzeltag wird `start = end = date` gespeichert und im PDF/Detail als „Leistungsdatum X" gerendert. Migration `0019_v0.12_service_periods.sql`, `user_version = 20`.
- Gilt für **Rechnungen, Stornorechnungen (geerbt), Angebote, Recurring-Vorlagen** (Header-Period nur Rechnungen+Angebote; Recurring nur Item-Felder).

### v0.6.0 (in Arbeit) — Mahnwesen + OCR-Light
- **Mahnungen als first-class Dokumente** (`reminders` Tabelle, eigener Nummernkreis `MA-...`, eigene PDF-Vorlage `reminder.html.j2`, Routen `/reminders` + `/reminders/new/:invoiceId`).
- **OCR-Light** — Text-Layer-Extraktion aus Eingangsrechnungen ohne ZUGFeRD-XML via `pypdf`. Neuer Sidecar-Command `extract_text_pdf`, Heuristik-Parser für Datum / Betrag / Rechnungsnummer / Lieferantenname. Fallback in der `/expenses`-Drop-Zone wenn `extract_zugferd` `found: false` liefert. Kein Tesseract, kein Bundle-Bloat — reine Scans funktionieren nicht und sollen es auch nicht.

### v0.5.0 (released) — „Buchhaltungs-Light"
- **Eingangsrechnungen** (`/expenses`, Tabellen `expenses` + `expense_items`, Nummernkreis `EX-YYYY-NNNN`). Reverse-Charge als Leistungsempfänger, Kategorie-Autocomplete aus der Belegehistorie.
- **Lieferanten** (`/vendors`, `L-NNNN`).
- **ZUGFeRD-Drop-Zone** im Expense-Editor: `extract_zugferd` (Sidecar, `factur-x` + `lxml`) parsed BASIC/EN16931/EXTENDED defensiv. Vendor-Matching per USt-IdNr. (fallback Name). Original-PDF landet kollisionssicher unter `~/Documents/Zettel/Eingangsrechnungen/<vendor-slug>/`.
- **DATEV-Export erweitert** (Erlöse + Aufwände + Stornos im selben Buchungsstapel, SKR03/SKR04, `expense_items.datev_account` als per-Position-Override).
- **UStVA-Vorbereitung** (`/reports/ustva`) — Quartals-Aggregation der ELSTER-Kennzahlen 81/86/41/21/66. Reine Vorbereitungshilfe zum Abtippen, kein ELSTER-Upload.
- **Dashboard** mit „Offene Eingangsrechnungen / Ausgaben YTD / Saldo YTD"-Cards. Sidebar in Gruppen sortiert.

### v0.4.x (released)
- **PDF-Themes** (classic / modern / minimal) via CSS-Variablen in einer einzigen `invoice.html.j2`. Gilt auch für Angebote.
- **Reverse-Charge Drittland** — `reverse_charge_type = 'third_country'` zusätzlich zu `'intra_eu'`. ZUGFeRD `CategoryCode G` + `ExemptionReason "Export outside EU"`.
- **Backup-Verschlüsselung** (AES-256-GCM um den ZIP-Stream, Argon2id-Key, Magic-Header `ZETTEL-ENC-1`, kein gespeichertes Master-Passwort).
- **Granularer Restore** (Kunden / Rechnungen+PDFs / Settings unabhängig via `ATTACH DATABASE` + selektives `INSERT`).
- **„Aus Rechnung Vorlage erstellen"** — Recurring-Template aus existierender Rechnung.
- **PDF/A-3b für Angebote** (kein ZUGFeRD-XML, aber Archivierungs-konform via WeasyPrint 65.1 `pdf_variant="pdf/a-3b"`).
- **Auto-Update** (Tauri Updater, Ed25519-signiert, statisches `latest.json` bei GitHub Releases). v0.4.3 ist das erste echte Update-fähige Release — v0.4.0-User müssen einmalig manuell upgraden.

### v0.3.x (released) — Angebote + Stornos
- **Angebote** (`/offers`, eigene Tabelle, Konvertierung zu Rechnung).
- **Stornorechnungen** mit EN-16931-konformem CII-XML (`InvoiceReferencedDocument` an korrekter Schema-Position).

### v0.2.0 (released)
- **Reverse-Charge intra-EU B2B** (`CategoryCode K`, ExemptionReason "VAT exempt for EEA intra-community supply...", `<ram:SpecifiedTaxRegistration schemeID="VA">`).
- **BASIC + EXTENDED ZUGFeRD-Profile** — URN parametrisiert via `{{ guideline_urn }}` in `zugferd-en16931.xml.j2`, gewählt in `zugferd.py:_PROFILE_URNS`.
- **DATEV-Export** (`/export`, `src/lib/export/datev.ts`, Format 700, SKR03/SKR04, eine Zeile pro VAT-Gruppe pro Rechnung). Geschrieben via Rust-Command `save_text_file` — vermeidet `plugin-fs`-Dependency.
- **Backup / Restore** (`src-tauri/src/backup.rs`): ZIP aus SQLite-Snapshot (`VACUUM INTO`) + PDFs + `manifest.json`. Restore ist **staged**: extrahiert nach `<appdata>/pending_restore/` + Marker-File, dann `apply_pending_restore_blocking()` in `lib.rs:run()` BEVOR das SQL-Plugin die DB öffnet.
- **Recurring** (`/recurring`, monthly/quarterly/yearly, manuelle „Jetzt erzeugen"-Bestätigung pro Invoice, kein Background-Scheduler).
- **`.gitattributes`** pinnt LF für alle Code-Files — `include_str!`-Migrationen müssen byte-stabil über Plattformen sein.

### v0.1.0 (released)
M1–M5 abgeschlossen, 5/5 manuell generierte Rechnungen gegen erechnungs-validator.de validiert, Windows MSI+NSIS shipped. Output-Pfad: `~/Documents/Zettel/Rechnungen/<RE-...>.pdf`.

## Sidecar
- **Dev:** Python script `sidecar/main.py`, vom Rust pro Command via `std::process::Command` gespawnt, JSON über stdin/stdout. Siehe `src-tauri/src/sidecar.rs` und `src/lib/sidecar/invoice.ts`.
- **Release:** PyInstaller-Bundle `zettel-sidecar(.exe)` als Tauri-Resource (`bundle.resources` in `tauri.conf.json` → `../sidecar/dist/zettel-sidecar` → `<resource_dir>/sidecar/`). `sidecar.rs` wählt dev vs. release via `cfg!(debug_assertions)`.
- **Build:** `cd sidecar && python build.py` (`pyinstaller==6.11.1` im venv). Auf Windows wird **jede** `.dll` aus dem GTK3-Runtime-Install-Dir neben die exe kopiert — verschiedene GTK-Builds versionieren Libs unterschiedlich (gtk3-classic ships libffi-7/libtiff-5, official MSI ships -8/-6), daher keine Allowlist.
- **Python-Resolution (dev):** `ZETTEL_PYTHON` env → `sidecar/.venv/Scripts/python.exe` (Win) bzw. `.../bin/python` (Unix) → `python` aus PATH.
- **GTK-Lookup** (`main.py:_add_gtk_dll_path`): frozen → exe-dir zuerst (build.py co-located DLLs), dann `C:\Program Files\GTK3-Runtime Win64\…`, dann msys64. Override: `ZETTEL_GTK_PATH`.

### Commands
| Command | Implementation | Purpose |
|---|---|---|
| `ping` | inline in `main.py` | Sidecar-Healthcheck |
| `generate_invoice` | `invoice/pdf.py:render_invoice_pdf` | Rechnung-PDF/A-3 mit ZUGFeRD-XML |
| `generate_offer` | `invoice/pdf.py:render_offer_pdf` | Angebot-PDF/A-3b (kein XML) |
| `generate_reminder` | `invoice/pdf.py:render_reminder_pdf` (v0.6) | Mahnungs-PDF/A-3 (kein XML) |
| `extract_zugferd` | `invoice/extract.py:extract_from_pdf` | Factur-X-XML aus eingehender PDF parsen |
| `extract_text_pdf` | `invoice/text_extract.py:extract_text_heuristic` (v0.6) | Text-Layer-Heuristik via `pypdf`, regex-basiert |

### Template-Quirks
- ZUGFeRD-XML aus `sidecar/templates/zugferd-en16931.xml.j2` (Jinja, `autoescape=True` — `select_autoescape` matcht `.xml.j2` NICHT, weil es nur die letzte Extension prüft), eingebettet via `factur-x.generate_from_binary(level=payload.profile or "en16931")`. `GuidelineSpecifiedDocumentContextParameter` URN parametrisiert via `{{ guideline_urn }}`, gewählt aus `zugferd.py:_PROFILE_URNS`.
- **Kleinunternehmer-Quirk** (BR-CO-26): wenn `company.vatId` fehlt, emittiert das Template `taxNumber` als `<ram:ID>` (BT-29) in `<ram:SellerTradeParty>`, damit die Seller-Identifications-Regel auch ohne USt-IdNr. erfüllt ist.
- **Logo:** `pdf.py:_logo_data_uri` liest `company.logoPath` von Disk und inlined als `data:` URI — vermeidet WeasyPrint-Base-URL-Resolution gegen beliebige User-Pfade.
- **Reverse-Charge:** wenn `invoice.isReverseCharge`, dann `CategoryCode K` (intra_eu) bzw. `G` (third_country) + `ExemptionReason` pro Zeile und im document-level `ApplicableTradeTax`. Buyer-USt-IdNr. in `<ram:SpecifiedTaxRegistration schemeID="VA">`.

## Rust-only modules (`src-tauri/src/`)
- `sidecar.rs` — spawnt Python-Sidecar (dev vs. release). Tauri-Commands: `generate_invoice`, `generate_offer`, `generate_reminder` (v0.6), `extract_zugferd`, `extract_text_pdf` (v0.6), `ping_sidecar`.
- `fs_export.rs` — `save_text_file(path, content)` für CSV-Exports ohne `plugin-fs`. `import_expense_pdf` für Eingangsrechnungs-Ablage.
- `backup.rs` — `snapshot_db_path`, `bundle_backup`, `stage_restore`, `apply_pending_partial_restore`. `apply_pending_restore_blocking()` läuft in `run()` BEVOR Plugin-Init, sodass das SQL-Plugin die frisch wiederhergestellte DB öffnet. App-Identifier ist hardcoded `digital.laux.zettel`, weil der Pre-Builder-Hook keinen AppHandle hat. Deps: `zip` (deflate), `walkdir`, `dirs`, `rusqlite` (für ATTACH DATABASE im Partial-Restore).
- `crypto.rs` — AES-256-GCM + Argon2id für optionale Backup-Verschlüsselung.

## Cross-platform builds
- `.github/workflows/build.yml` Matrix: windows-latest, macos-14 (arm64), macos-13 (x86_64), ubuntu-22.04. Jeder Runner installiert Python+GTK+Tauri-Deps, baut `python sidecar/build.py`, dann `pnpm tauri build --target <triple>`. Artefakte hochgeladen; Release-Job triggert auf `v*` Tag.
- CI signiert via `TAURI_SIGNING_PRIVATE_KEY`, uploaded `.sig`-Files + generiertes `latest.json` an den Release (für Auto-Update). Tauri-2-Quirk: NSIS-Setup-Sig ist `-setup.exe.sig`, nicht `*.nsis.zip.sig`. `bundle.createUpdaterArtifacts` MUSS in `tauri.conf.json` gesetzt sein.
- **Linux/macOS-caveat:** WeasyPrint lädt Pango/Cairo dynamisch vom System. User brauchen `apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0` bzw. `brew install pango cairo gdk-pixbuf`. Bundling wäre Phase-2.
- Lokaler Windows-Install: `C:\Users\<user>\AppData\Local\zettel\` (NSIS user-scope).

## Stack quick-ref
- **Frontend:** Svelte 5 (runes!), TypeScript strict, Vite, Tailwind v4, Bits UI
- **Routing:** `svelte-spa-router` — hash-based, lightweight (kein SvelteKit)
- **Persistence:** `@tauri-apps/plugin-sql` (SQLite). Schema in `src/lib/db/schema.ts` (Drizzle, types only). Queries sind raw parameterized SQL via `src/lib/db/client.ts` — Drizzle ORM ist **nicht** zur Laufzeit gewired. Migrationen liegen in `src/lib/db/migrations/*.sql` und werden compile-time in `src-tauri/src/lib.rs` via `include_str!` eingebettet.
- **Money:** immer Cent (integer) in DB, Display-Formatierung via `src/lib/utils/money.ts`.

## Conventions
- **UI lives in `src/lib/ui/`** — thin shadcn-style wrappers über Bits UI primitives (Button, Card, Dialog, Dropdown, Input, Select, Textarea, Badge, Titlebar, Toaster). Theme tokens in `src/lib/theme.svelte.ts` (light/dark/system). Lucide icons via `@lucide/svelte`. Wrapper NICHT umgehen — extend them.
- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`). Keine legacy stores in components, kein `export let`. Neue Komponenten: `<script lang="ts">` mit runes.
- **Deutsche UI-Strings**, englische Code/Identifier/Comments.
- **Keine Kommentare außer wenn WARUM nicht offensichtlich.**
- **Nummern-Konventionen**: Kunden `K-0001`, Lieferanten `L-0001`, Rechnungen `RE-2026-0001`, Angebote `AN-2026-0001`, Ausgaben `EX-2026-0001`, Mahnungen `MA-2026-0001`. Format konfigurierbar in Settings.
- **Lazy Invoice Numbering (ab v0.9)**: Neue Rechnungs-Drafts kriegen einen `DRAFT-<hex>`-Platzhalter — der `invoice_number_counter` wird **erst** beim `issueInvoice()` gezogen (markSent / PDF-Generierung). Drafts löschen → keine Lücken. `displayInvoiceNumber()` in `src/lib/db/invoices.ts` maskiert Platzhalter als „Entwurf" in der UI. Gilt nur für Rechnungen; Angebote/Mahnungen/Ausgaben behalten Eager-Numbering. Bestandsdrafts mit echten Nummern bleiben unangetastet.
- **Backdating (ab v0.9)**: `markSent(id, sentAt?)` und `markPaid(id, paidAt?)` akzeptieren optionalen Unix-Timestamp. Default = jetzt. UI in `InvoiceDetail.svelte` zeigt Date-Picker-Dialog mit Plausibilitäts-Warnung (Zahldatum < Versanddatum etc., soft warning).
- **Sandbox (ab v0.9)**: Flag-File `sandbox.flag` im AppData-Dir (`digital.laux.zettel/`). Wenn gesetzt, öffnet `src/lib/db/client.ts` `sqlite:zettel-sandbox.db` statt `sqlite:zettel.db`. Migrations werden für beide URLs registriert (`src-tauri/src/lib.rs:build_migrations()`). Tauri-Commands `is_sandbox` / `set_sandbox` in `src-tauri/src/sandbox.rs`. Toggle in Settings → `plugin-process::relaunch()`. Banner in `Layout.svelte`.
- **DB-Column-Naming**: snake_case in SQL, gemappt auf camelCase in TS via `mapXxx()` Helper in `queries.ts` / `invoices.ts` / `recurring.ts` / `expenses.ts` / `reminders.ts`.
- **Migrationen sind byte-sensitiv.** Eingebettet via Rust `include_str!`. `.gitattributes` pinnt LF für alle `*.sql`. Niemals den Inhalt einer Migration nach dem Shipping ändern — neue Version, neue Migration.
- **No popup windows:** alle Form-/Edit-Screens nutzen `push("/...")` In-App-Routing. Niemals separate Tauri WebviewWindow öffnen.

## Git workflow
- Feature-Arbeit landet in `release/vX.Y`-Branches via PR. main = letztes shipped Release.
- Squash-merge PRs in den Release-Branch; ein konsolidierender PR `release/vX.Y → main` zum Release-Zeitpunkt.
- Conventional Commits (`feat`, `fix`, `chore`, `docs`).
- Alle git/pnpm/gh/cargo-Commands laufen via **PowerShell** (Windows Tauri project). WSL bash ist OK für `Read`/`Edit`/`Write`-Tools.

## Commands
- `pnpm tauri:dev` — full app (Tauri + Vite)
- `pnpm dev` — frontend only (kein Tauri-API, DB-Calls schlagen fehl)
- `pnpm db:generate` — Migrationen aus Drizzle-Schema regenerieren
- `pnpm check` — svelte-check

## Don't
- Keine Backend-HTTP-Server — alles ist Tauri-Commands oder direkt SQLite.
- Kein React, SvelteKit, styled-components.
- Money niemals als float speichern.
- Keine Telemetrie.
- Keine Tesseract-Dependency (Scan-OCR ist explizit Non-Goal für v0.6).
- Keine ELSTER-Anbindung (Non-Goal, würde GoBD-Disclaimer aufweichen).
