# Changelog

Alle nennenswerten Änderungen an Zettel werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

## [0.7.0] — 2026-05-17

> **UI-Polish.** Reine Oberflächen-Iteration: dezente Bewegung, Geist als App-Font, frei wählbare Akzentfarbe (inkl. Windows-System-Akzent), und der letzte native Form-Primitive ist weg.

### Added
- **Geist + Geist Mono** als App-Font (self-hosted via `@fontsource-variable/*`). Ersetzt Inter, das vorher nur als CSS-Name geführt und auf Windows-Systemen ohne Inter-Install still auf Segoe UI zurückfiel — jetzt konsistent über alle Plattformen. Tabular-Zahlen (Rechnungsnummern, Beträge, IBAN, Daten) ziehen automatisch über die existierenden `font-mono`-Klassen Geist Mono. PDF-Templates sind bewusst nicht angefasst.
- **Akzentfarbe konfigurierbar** in Settings → Darstellung. Sieben Presets (Schiefer/Indigo/Violett/Rosé/Smaragd/Bernstein/Himmel) mit jeweils light- und dark-tauglichen oklch-Werten, plus **„System"-Option**, die auf Windows die DWM-Akzentfarbe aus der Registry zieht (`HKCU\Software\Microsoft\Windows\DWM\AccentColor`). macOS/Linux fallen auf das Slate-Default zurück, bis Plattform-APIs ergänzt sind. Wechsel ist instant, ohne Save-Knopf; Persistenz via localStorage (analog zum Theme).
- **Dezente Animationen** durchgängig: 180-ms-Fade auf Routenwechsel, gestaffeltes Card-/Row-Entry auf Dashboard und allen Listen-Tabellen, animiertes Active-Indicator-Bar in der Sidebar, leichter Hover-Lift auf klickbaren Cards, `active:scale`-Feedback auf Buttons und Checkboxen. `prefers-reduced-motion` schaltet alles auf 0.01 ms.
- **Eigener `Checkbox`-Wrapper** in `src/lib/ui/` über Bits UI mit shadcn-Styling, Indeterminate-State und Active-Press-Feedback. Ersetzt 13 native `<input type="checkbox">` quer durch den Code — damit nutzt jedes Form-Element jetzt unsere UI-Schicht.

### Changed
- `--primary`, `--primary-foreground` und `--ring` werden jetzt zur Laufzeit überschrieben statt nur über `data-theme="dark"` gemappt. Erlaubt Live-Switch der Akzentfarbe ohne Reload.

### Notes
- Kein Schema-Migration, keine Backend-Änderung. Sidecar + PDF-Pipeline sind unangetastet — v0.7 ist garantiert byte-identische PDFs gegenüber v0.6.
- Windows-only neue Dependency: `winreg` als `cfg(windows)`-Target-Dep. Andere Plattformen ziehen das nicht.

## [0.6.0] — 2026-05-17

> **Mahnwesen + OCR-Light.** v0.6 schließt zwei der offensichtlichsten Lücken im Workflow: überfällige Rechnungen können jetzt sauber gemahnt werden, und Eingangsrechnungen ohne ZUGFeRD-XML werden per Text-Heuristik vorbefüllt statt komplett manuell.

### Added
- **Mahnungen als first-class Dokumente** (`/reminders`). Neue Tabelle `reminders` mit eigenem Nummernkreis `MA-YYYY-NNNN`, 3-stufiges Level-Modell (Zahlungserinnerung / Mahnung / Letzte Mahnung), Snapshot der Original-Rechnung pro Mahnung. Eigene PDF-Vorlage `reminder.html.j2` (PDF/A-3b, bewusst ohne ZUGFeRD-XML — eine Mahnung ist keine E-Rechnung im Sinne EN16931). Aufschlüsselung Rechnungsbetrag + Mahngebühr + Verzugszinsen = neuer Gesamtbetrag. (#44, PR #45)
- **Überfällige-Rechnungen-Widget** auf `/reminders` mit Tage-Überfälligkeit, bestehenden Mahnstufen und Direkt-Button für die nächste Stufe. Auch `InvoiceDetail.svelte` zeigt einen kontextsensitiven Mahn-Button für `sent`-Rechnungen mit überschrittenem `dueDate`, der die nächste plausible Stufe vorschlägt.
- **Default-Mahntexte** in Settings (`reminder_text_l1/l2/l3`) als deutsche Standardformulierungen — pro Mahnung im Editor noch frei änderbar. Tage-bis-Fälligkeit und Gebühren-Defaults pro Stufe konfigurierbar (Standard: 14 / 14 / 14 Tage, 0 / 5 / 10 EUR).
- **OCR-Light** für Eingangsrechnungen ohne ZUGFeRD-Anhang (`/expenses` Drop-Zone). Neuer Sidecar-Command `extract_text_pdf` (pypdf liest Text-Schicht, Regex-Pattern extrahieren Rechnungsnummer / Datum / Total / Vendor-Name / USt-IdNr.). Vendor-Match per USt-IdNr. (zuverlässig) oder Name-Substring (heuristisch). Bei zwei Stufen (ZUGFeRD scheitert → Text-Heuristik) bekommt der User einen deutlichen „bitte alle Werte prüfen"-Toast. Tesseract/Image-OCR bleibt **explizit ausgeschlossen** — reine Scans sind weiterhin manuell. (#43, PR #46)

### Fixed
- **`CURRENT_SCHEMA` in `backup.rs` stand seit v0.5 auf 9, obwohl `PRAGMA user_version` bereits 10 war.** Latente Bug, der v0.5-Backups beim Restore mit „Schema neuer als App-Version" abgelehnt hätte (analog v0.4.0-Bug, siehe Changelog). Mit v0.6 auf 11 gezogen, Frontend-Mirror in `Settings.svelte:CURRENT_DB_SCHEMA_VERSION` ebenfalls.

### Migration
- `0010_reminders.sql` — `user_version = 11`. Erstellt `reminders` und fügt 13 Settings-Spalten für Mahnungs-Defaults hinzu. Idempotent (`CREATE TABLE IF NOT EXISTS`, alle `ALTER TABLE … ADD COLUMN` haben Defaults).

### Notes
- **Bewusst NICHT in v0.6:** dediziertes Mahnwesen-Settings-UI (Defaults reichen für MVP, Mahntexte werden im Editor pro Mahnung angepasst), automatischer Mahn-Versand per Mail/SMTP, Hintergrund-Scheduler, gerichtliches Mahnverfahren / Inkasso, Tesseract-OCR für gescannte PDFs.

## [0.5.0] — 2026-05-16

> **Buchhaltungs-Light.** Zettel deckte bisher nur Ausgangsbelege ab — v0.5 macht den Gegenpol auf. Eingangsrechnungen mit ZUGFeRD-Drag-&-Drop, Lieferantenverwaltung, DATEV-Export inklusive Aufwände + Stornos, und ein UStVA-Vorbereitungs-Report. Damit ist der vollständige Steuerberater-Übergabe-Workflow abgebildet.

### Added
- **Eingangsrechnungen** (`/expenses`). Neues Datenmodell `expenses` + `expense_items` mit eigenem Nummernkreis `EX-YYYY-NNNN`, Statusfluss `draft → open → paid / cancelled`, Reverse-Charge-Erfassung als Leistungsempfänger, Kategorie-Feld mit Autocomplete aus der Belegehistorie. (#39, PR #42)
- **Lieferanten** (`/vendors`). Eigenes Stammdatenmodell `L-NNNN`, inkl. Bankverbindung und Standard-Kategorie für Vorbefüllung.
- **ZUGFeRD-Drop-Zone.** Eingehende PDFs per Drag & Drop in den Editor: neuer Sidecar-Command `extract_zugferd` (Python via `factur-x` + lxml) parsed eingebettete Factur-X-XML defensiv (BASIC/EN16931/EXTENDED). Vendor-Matching per USt-IdNr. (fallback Name), bei Treffer wird das Formular automatisch befüllt. Original-PDF landet kollisionssicher unter `~/Documents/Zettel/Eingangsrechnungen/<vendor-slug>/`. (#38, PR #42)
- **DATEV-Export erweitert.** Buchungsstapel enthält jetzt Erlöse **und** Aufwände im selben CSV. Konten-Mapping um Kreditor + Aufwand-19 %/7 %/Exempt/§13b erweitert (SKR03 + SKR04). `expense_items.datev_account` überschreibt Default-Konten pro Position. Stornorechnungen werden als Soll/Haben-Drehung exportiert. UI mit Checkboxen „Rechnungen / Eingangsrechnungen / Stornos einschließen". (#40, PR #42)
- **UStVA-Vorbereitungs-Report** (`/reports/ustva`). Quartalsweise Aggregation der ELSTER-Kennzahlen 81 / 86 / 41 / 21 / 66 als reine Vorbereitungshilfe zum Abtippen. CSV-Export. Disclaimer prominent: keine Steuerberatung, kein ELSTER-Upload. (#41, PR #42)
- **Dashboard-Cards** für „Offene Eingangsrechnungen", „Ausgaben YTD" und „Saldo YTD" (Einnahmen − Ausgaben als reiner Indikator, kein EÜR-Ersatz).
- **Sidebar aufgeräumt.** Nav-Items in Gruppen (Stammdaten, Ausgangsbelege, Eingangsbelege, Auswertung, System) mit dezenten Section-Headers. „Export" → „DATEV-Export" zur Abgrenzung vom UStVA-Report.

### Changed
- **Update-Check in den Settings-Header verschoben.** Statt einer eigenen Karte zwischen Backup und Save-Button sitzt der „Nach Updates suchen"-Button jetzt rechts oben im Header neben der Versionsanzeige — klare Trennung zwischen Formular (Daten ändern) und Aktion (App aktualisieren).

### Migration
- `0009_expenses.sql` — `user_version = 10`. Erstellt `vendors`, `expenses`, `expense_items` und fügt 4 Settings-Spalten (`vendor_number_format/counter`, `expense_number_format/counter`) hinzu. Idempotent.

### Notes
- **Bewusst NICHT in v0.5:** OCR für Nicht-ZUGFeRD-PDFs, Banking-Anbindung (FinTS), ELSTER-Direktupload, GoBD-Zertifizierung, wiederkehrende Eingangsrechnungen. Bleiben Non-Goals oder v0.6+.

## [0.4.3] — 2026-05-16

### Fixed
- **Auto-Update brach mit „None of the fallback platforms found in response platforms object" ab.** Zwei Ursachen: (1) `bundle.createUpdaterArtifacts` war in `tauri.conf.json` nicht gesetzt, sodass Tauri 2 keine `.sig`-Dateien für die Updater-Bundles generierte. (2) Der `latest.json`-Builder im CI-Workflow suchte nach Tauri-v1-Format `*.nsis.zip.sig`, Tauri 2 signiert die NSIS-`-setup.exe` aber direkt (sig = `-setup.exe.sig`). Damit blieb `platforms` im Feed leer, jeder Update-Check schlug fehl.

### Notes
- Damit ist v0.4.3 das erste tatsächlich Update-fähige Release. v0.4.2 → v0.4.3 ist der erste echte Auto-Update-Roundtrip.

## [0.4.2] — 2026-05-16

> **Hinweis:** v0.4.1 wurde nicht ausgeliefert — der CI-Build schlug fehl, weil `pnpm-lock.yaml` nicht aktualisiert war. v0.4.2 bündelt die Auto-Update-Implementierung und die Angebote-Verbesserungen mit dem Lockfile-Fix.

### Added
- **Auto-Update.** Tauri-Updater-Integration mit Ed25519-signierten Releases gegen einen statischen `latest.json`-Feed bei GitHub Releases. Beim App-Start (10 Sek nach Mount) prüft die App still auf neue Versionen; bei Verfügbarkeit erscheint ein Toast „Update v0.x.x verfügbar — Installieren". In den Einstellungen gibt es zusätzlich einen „Nach Updates suchen"-Button und die Anzeige der installierten Version. Plattformübergreifend (Windows NSIS, macOS, Linux AppImage). (#30, PR #33)
- **PDF-Themes auch für Angebote.** Das in v0.4 eingeführte `settings.pdf_theme` wirkt jetzt auch auf Angebot-PDFs. Kein separates Theme-Setting; gleicher Wert für Rechnungen und Angebote. (#31, PR #35)
- **Angebot-PDFs sind PDF/A-3b.** Angebote werden jetzt PDF/A-3-konform gerendert (XMP, sRGB-OutputIntent, eingebettete Schriften), passend zum Archivierungs-Charakter. Keine ZUGFeRD-XML-Einbettung — Angebote sind keine E-Rechnungen. (#32, PR #36)

### Fixed
- **CI baute keine Artefakte mehr.** Der Auto-Update-PR hatte die neuen Tauri-Plugin-Deps in `package.json` aufgenommen, `pnpm-lock.yaml` aber nicht regeneriert. `pnpm install --frozen-lockfile` (CI-Default) brach ab; v0.4.1 und ein erster v0.4.2-Tag wurden ohne Release-Artefakte gepublisht. Lockfile regeneriert, alte Tags entfernt, v0.4.2 frisch getagged.

### Internal
- Neue Tauri-Plugins `tauri-plugin-updater` und `tauri-plugin-process` (für `relaunch()`).
- Neues Frontend-Modul `src/lib/updater.ts`, kapselt `check()` / `downloadAndInstall()` / `relaunch()` mit Tauri-Guard.
- `Toaster` um optionale Action erweitert (Label + onClick), damit der Update-Toast einen klickbaren Installieren-Button hat.
- CI signiert Build-Artefakte mit `TAURI_SIGNING_PRIVATE_KEY` und uploadet `.sig`-Dateien + ein generiertes `latest.json` an den Release.
- WeasyPrint 65.1's nativer `pdf_variant="pdf/a-3b"` deckt PDF/A-3b vollständig ab — keine neue Python-Dep (pikepdf wurde nicht benötigt).
- `offer.html.j2` bekommt die Theme-Body-Klasse, `pdf.py` reicht `settings` in den Jinja-Context, `src/lib/sidecar/offer.ts` ergänzt `pdf_theme` im Payload — pure Vererbung über die geteilte `invoice.css`, kein CSS-Duplikat.
- Setup-Doku für Maintainer: `docs/auto-update-setup.md`.

### Notes
- Bestehende v0.4.0-Installationen erhalten dieses Update **nicht** automatisch — Auto-Update beginnt erst ab v0.4.2 → v0.4.3. v0.4.0-User müssen einmalig manuell upgraden.

## [0.4.0] — 2026-05-16

### Added
- **PDF-Themes.** Drei wählbare Designs (Klassisch, Modern, Minimal), umgesetzt über CSS-Variablen in einer einzigen `invoice.html.j2` — keine Template-Duplikation. Auswahl in den Einstellungen. ZUGFeRD-XML bleibt unberührt. (#18, PR #25)
- **Reverse-Charge Drittland.** Neuer Wert `reverse_charge_type = 'third_country'` zusätzlich zu `'intra_eu'`. ZUGFeRD/Factur-X weist `CategoryCode G` + `ExemptionReason "Export outside EU"` aus; Buyer-USt-IdNr. ist für Drittland-Ausfuhrlieferungen optional. UI wird Select statt Boolean. (#19, PR #27)
- **Optionale Backup-Verschlüsselung.** Passwort beim Backup → AES-256-GCM um den ZIP-Stream, Key via Argon2id. Magic-Header `ZETTEL-ENC-1` erkennt verschlüsselte Backups beim Restore automatisch; alte unverschlüsselte Backups bleiben restorebar. Kein gespeichertes Master-Passwort. (#20, PR #28)
- **Granularer Restore.** Drei unabhängige Checkboxen (Kunden, Rechnungen+PDFs, Einstellungen). Voll-Restore unverändert. Teil-Restore läuft via `ATTACH DATABASE` + selektivem `INSERT` nach App-Start, kein Neustart nötig. PDFs werden nur kopiert wenn der Rechnungs-Bereich gewählt ist. (#21, PR #26)
- **„Als Vorlage speichern" in Rechnungs-Detail.** Erzeugt aus einer Rechnung eine wiederkehrende Vorlage mit vorausgefülltem Kunde, Positionen, Reverse-Charge-Flag und Zahlungsfrist. User setzt nur noch Intervall + Erst-Fälligkeit. (#22, PR #23)

### Fixed
- **Storno-XML Schema-Reihenfolge.** `InvoiceReferencedDocument` lag im CII-Schema an falscher Position (vor statt nach `SpecifiedTradeSettlementHeaderMonetarySummation`). Audit + Korrektur, Report unter `docs/v0.3.1-storno-validation.md`. (#17, PR #24)
- **Backup-Restore lehnte v0.4-Backups ab.** `CURRENT_SCHEMA`-Konstante in `backup.rs` war seit v0.2 nicht mehr mitgewachsen; der Manifest-Check hätte jedes v0.4-Backup mit „Schema neuer als App-Version" abgelehnt. Auf 9 angehoben.
- **Settings-Schema-Mirror.** `CURRENT_DB_SCHEMA_VERSION` im Frontend wurde mit Migration 0008 nicht mitgezogen — auf 9 korrigiert.

### Internal
- Schema-Migrationen 0007 (`settings.pdf_theme`, DB-Version 8) und 0008 (`invoices.reverse_charge_type`, DB-Version 9).
- Neues Rust-Modul `crypto.rs` (AES-256-GCM + Argon2id).
- Neuer Tauri-Command `apply_pending_partial_restore` mit `rusqlite` + `ATTACH DATABASE` für selektive Wiederherstellung.
- `bundle_backup` packt jetzt auch Angebote-PDFs in den ZIP (war seit v0.3 ein stiller Gap).
- QA-Report unter `docs/v0.4-qa-report.md`.

### Known limitations
- Themes greifen nur für Rechnungen, nicht für Angebote (Follow-up).
- Drittland-Rechnungen + Themes-Rendering sollten stichprobenartig gegen `erechnungs-validator.de` validiert werden vor dem Release-Tag.
- Encrypted-Backup-Roundtrip einmal manuell durchspielen vor dem Tag.

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
- macOS Intel (x86_64) Build wurde aus der Matrix entfernt — GitHub-Free-Tier-Runner für `macos-13` haben Queue-Zeiten von 1h+. macOS Apple Silicon (arm64) wird gebaut und deckt die meisten Nutzer ab. Intel-Build kommt zurück, sobald Capacity oder ein Use-Case da ist.
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
