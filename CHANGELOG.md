# Changelog

Alle nennenswerten Änderungen an Zettel werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

## [0.3.0] — 2026-05-16

### Added
- **Angebote / Quotes.** Neuer Dokumenttyp unter `/offers` mit eigenem Nummernkreis (`AN-{YYYY}-{NNNN}`, in Settings konfigurierbar) und Statusflow Entwurf → Versendet → Angenommen / Abgelehnt / Abgelaufen. Eigenes PDF-Template ohne ZUGFeRD-Embed (Angebote sind keine E-Rechnungen) und ohne PDF/A-3. Output landet in `~/Documents/Zettel/Angebote/`. Konfigurierbare Standard-Gültigkeit in Tagen; abgelaufene Angebote werden beim Öffnen der Liste / des Dashboards automatisch auf „Abgelaufen" gesetzt.
- **In Rechnung umwandeln.** Angenommene Angebote können mit einem Klick in einen Rechnungs-Entwurf konvertiert werden: Positionen werden 1:1 kopiert, Customer + Reverse-Charge-Flag übernommen, der User landet direkt im Rechnungs-Editor um Lieferdatum, Zahlungsfrist etc. zu finalisieren. Verknüpfung in beide Richtungen sichtbar.
- **Stornorechnungen / Korrekturrechnungen.** Versendete oder bezahlte Rechnungen können storniert werden — erzeugt einen Rechnungs-Entwurf mit gespiegelten Positionen, die der User für Teilrückerstattungen anpassen kann. Originalrechnung bleibt unverändert (rechtssicher, kein Soft-Delete bezahlter Belege). Totals werden negativ gespeichert, sodass Dashboard- und DATEV-Summen automatisch netten.
- **ZUGFeRD/Factur-X für Stornorechnungen.** `TypeCode 381` (Credit Note) statt 380, `ram:InvoiceReferencedDocument` (BT-25/BT-26) mit Originalrechnungsnummer und Ausstellungsdatum, negative Beträge in Header und Positionen, keine `SpecifiedTradePaymentTerms` (Stornos haben keine Fälligkeit).
- **Dashboard-Kachel „Offene Angebote".** KPI mit Summe und „läuft bald ab"-Hinweis (Angebote, die in den nächsten 7 Tagen verfallen).
- **Sidebar-Versionsanzeige** ist jetzt dynamisch aus `package.json` (zuvor hardcoded `v0.1.0`).

### Changed
- **DATEV-Export** unterscheidet zwischen Rechnungen und Stornorechnungen: Storno-Zeilen erhalten Soll/Haben-Kennzeichen `H` (statt `S`), Buchungstext-Präfix wird zu „Storno". DATEV invertiert die Buchungsrichtung automatisch.
- **Invoice Detail / Edit / List** zeigen Storno-Status mit Bannern und einem inline „Storno"-Badge; Zahlungs- und Fälligkeits-Sektionen werden für Stornos unterdrückt.

### Internal
- Schema-Migrationen 0005 (`offers` + `offer_items` + drei `offer_*` Settings-Spalten, DB-Version 6) und 0006 (`is_credit_note` + `corrects_invoice_id` auf `invoices`, DB-Version 7).
- Neuer Tauri-Command `generate_offer` neben `generate_invoice`; gemeinsamer Python-Sidecar, eigener Template-Pfad `templates/offer.html.j2`.
- `Invoice.isCreditNote` / `correctsInvoiceId` durchgehend durch DB-Layer, TS-Sidecar-Wrapper und Jinja-Templates propagiert.

### Known limitations
- Manuelle Validierung der Storno-PDFs gegen `erechnungs-validator.de` steht aus — insbesondere die Platzierung von `InvoiceReferencedDocument` im EN-16931-CII-Schema
- Angebote-PDFs sind nicht-PDF/A; reicht für interne Belege aber nicht für rechtssicheres Langzeit-Archiv
- Kein automatisches Versenden von Erinnerungen bei demnächst ablaufenden Angeboten

## [0.2.0] — 2026-05-16

### Added
- **Reverse-Charge / intra-EU B2B.** Toggle im Rechnungs-Editor, ZUGFeRD `CategoryCode K` + `ExemptionReason "VAT exempt for EEA intra-community supply of goods and services"`, deutsch-englischer Hinweistext „Steuerschuldnerschaft des Leistungsempfängers / Reverse charge" auf der Rechnung. Aktivierbar nur wenn beide Parteien eine USt-IdNr. haben und der Sender nicht Kleinunternehmer ist; erzwingt 0 % auf allen Positionen. (#2, PR #7)
- **BASIC + EXTENDED ZUGFeRD-Profile** in den Settings aktivierbar. Profil-URN wird in der `GuidelineSpecifiedDocumentContextParameter` im XML gesetzt; `factur-x`-Level passend zum Profil. (#3, PR #9)
- **DATEV-Export** (Buchungsstapel, Format 700) unter `/export`. Zeitraum + Kontenrahmen wählen, CSV mit UTF-8-BOM und CRLF-Zeilenenden speichern. SKR03 (Default) und SKR04. Eine Buchungszeile pro USt-Rate pro Rechnung. Kleinunternehmer-Rechnungen auf das steuerfreie Erlöskonto (8200/4200), Reverse-Charge auf das innergemeinschaftliche Lieferungs-Konto (8336/4125), Kunden-USt-IdNr. im Feld „EU-Land u. UStID". (#4, PR #8)
- **Backup & Restore** unter Einstellungen → ZIP mit konsistentem SQLite-Snapshot (via `VACUUM INTO`), allen erzeugten PDFs aus `~/Documents/Zettel/Rechnungen/` und `manifest.json` (App-Version + Schema-Version). Restore wird beim nächsten App-Start eingespielt; alte DB landet als `zettel.db.bak`. (#5, PR #11)
- **Wiederkehrende Rechnungen / Retainer-Vorlagen** unter `/recurring`: Vorlage mit Kunde, Intervall (monatlich / quartalsweise / jährlich), Erst-Fälligkeit, Zahlungsfrist, Positionen, Reverse-Charge-Flag. Dashboard zeigt fällige Vorlagen prominent; „Jetzt erzeugen" erstellt einen Rechnungs-Entwurf und bumpt die nächste Fälligkeit. Keine automatische Hintergrund-Generierung — User bestätigt jede Rechnung. (#6, PR #12)

### Internal
- `.gitattributes` pinnt LF für alle Code-Files. Migrations werden via Rust `include_str!` zur Compile-Zeit gelesen — CRLF-Checkouts auf Windows hatten zu „migration N was previously applied but has been modified"-Panics geführt. Future-proof für Cross-Plattform-Contributors. (PR #10)
- CI-Workflow überspringt den Matrix-Build bei reinen Doku-Änderungen (`paths-ignore`).
- Neuer Rust-Command `save_text_file(path, content)` für CSV-Exporte ohne `plugin-fs`.
- Neues Rust-Modul `backup.rs` mit pre-Builder-Hook `apply_pending_restore_blocking()`, der vor SQL-Plugin-Init läuft.
- Schema-Migrations 0003 (`is_reverse_charge`) und 0004 (`recurring_invoices` + `recurring_invoice_items`).

### Known limitations
- Cross-Platform-Build (macOS/Linux) noch nicht gegen einen echten Validator getestet
- Manuelle Validierung der neuen Features (Reverse-Charge, BASIC/EXTENDED) gegen `erechnungs-validator.de` steht aus
- Keine Verschlüsselung für Backup-ZIPs

## [0.1.0] — 2026-05-16

### Added
- Offline-first Tauri-2-Desktop-App (Windows / macOS / Linux)
- Lokale Kunden- und Rechnungsverwaltung (SQLite)
- Status-Workflow für Rechnungen: Entwurf → Versandt → Bezahlt → Storniert
- Mehrere Umsatzsteuersätze pro Rechnung (0 %, 7 %, 19 %)
- Kleinunternehmer-Modus nach § 19 UStG inkl. korrektem ZUGFeRD-XML-Fallback (BR-CO-26)
- PDF/A-3-Generierung mit eingebettetem Factur-X / EN-16931-XML (Python-Sidecar, WeasyPrint + factur-x)
- Logo-Upload für Rechnungs-Header
- ZUGFeRD-Profil-Selector in Settings (EN 16931 in v0.1 aktiv; BASIC / EXTENDED vorbereitet)
- Konfigurierbare Nummernkreise (`K-0001`, `RE-{YYYY}-{NNNN}`)
- shadcn-Style-UI-Schicht (`src/lib/ui/`) über Bits-UI-Primitives, Light/Dark/System-Theme, Lucide-Icons
- GitHub-Actions-Matrix-Build für Windows / macOS (arm + x86) / Linux
- Issue- und Pull-Request-Templates

### Validation
- 5 von 5 manuell erzeugten Test-Rechnungen erfolgreich gegen [erechnungs-validator.de](https://erechnungs-validator.de) validiert

### Known limitations
- Code-Signing fehlt — Windows zeigt SmartScreen-Warnung beim ersten Start
- macOS-Builds sind nicht notarisiert
- WeasyPrint benötigt unter Linux/macOS Pango/Cairo/gdk-pixbuf aus dem System
- Reverse-Charge / intra-EU B2B (CategoryCode K) noch nicht abgedeckt
- Eingangsrechnungs-Verarbeitung nicht im Scope von 0.1

[Unreleased]: https://github.com/jonax1337/zettel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jonax1337/zettel/releases/tag/v0.2.0
[0.1.0]: https://github.com/jonax1337/zettel/releases/tag/v0.1.0
