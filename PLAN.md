# Faktura — Project Plan

> **Name:** Zettel
> **Status:** v0.6.0 released (Mahnwesen + OCR-Light) · v0.5.0 release: Buchhaltungs-Light
> **Released:** v0.1.0 → v0.4.3 (alle 2026-05-16, Auto-Update aktiv ab v0.4.3)
> **Lizenz:** MIT
> **Owner:** Jonas Laux ([laux.digital](https://laux.digital))

---

## 1. Übersicht

Offline-first, plattformübergreifender Rechnungs-Generator für Selbstständige und Kleinunternehmer im deutschen Sprachraum. Open Source. Erzeugt **ZUGFeRD / Factur-X**-konforme PDF/A-3-Rechnungen mit eingebettetem EN 16931-konformem XML — also Rechnungen, die wie normale PDFs aussehen, aber gleichzeitig maschinenlesbar sind und der deutschen E-Rechnungs-Norm entsprechen.

Zielgruppe: Freelancer, Solo-Selbstständige, Kleinunternehmer nach §19 UStG, die ein lokales Tool wollen statt SaaS-Abo (lexoffice, sevDesk, FastBill).

---

## 2. Ziele

- **Lokale Verwaltung** von Kunden, Rechnungen, Settings — keine Cloud, keine Accounts
- **ZUGFeRD/Factur-X als Default** (PDF + XML in einem Dokument)
- **Kleinunternehmer-Modus (§19 UStG)** als First-Class-Feature: korrekte Hinweise, keine USt-Ausweisung
- **Cross-Platform:** Windows (Priorität), macOS, Linux
- **Schlank:** Bundle möglichst klein, schneller Start, niedriger RAM-Verbrauch
- **Funktional > schön, aber nicht hässlich:** Eigene schlanke UI-Schicht (`src/lib/ui/`) auf Bits-UI-Primitives, shadcn-Style, dezent. Keine Brand-Heroics, aber konsistentes Spacing, Light/Dark-Theme, Lucide-Icons.
- **OSS-freundlich:** klare Struktur, dokumentiert, contributor-ready

---

## 3. Non-Goals (explizit ausgeschlossen)

- ❌ Vollständige Buchhaltung im Sinne von EÜR-Abgabe, Steuererklärung, Bilanz, GoBD-Zertifizierung
- ❌ Banking-Integration / Kontoabgleich (HBCI, FinTS)
- ❌ Mehrbenutzer / Cloud-Sync / SaaS-Modus
- ❌ Mehrmandantenfähigkeit
- ❌ Mobile App (Desktop-only)
- ❌ ELSTER-Direkt-Upload (UStVA-Vorbereitung als Report ist OK, Upload nicht)
- ❌ OCR für Nicht-ZUGFeRD-PDFs (Phase v0.6+)

**Erweiterung ab v0.5.0:** „Buchhaltungs-Light" ist erlaubt — also Eingangsrechnungen erfassen, Lieferanten verwalten, Kategorien, einfache Saldo-Übersicht. Die obigen Non-Goals bleiben aber bestehen.

---

## 4. Tech Stack

### Frontend
- **Tauri 2** — Desktop-Wrapper, Cross-Platform
- **Svelte 5** mit Runes — Frontend-Framework
- **TypeScript** (strict mode)
- **Vite** — Build-Tool
- **Tailwind v4** — Styling (minimal, funktional)
- **Bits UI** — Headless-Primitives als Basis für eine eigene, schlanke Komponenten-Schicht unter `src/lib/ui/` (shadcn-Stil: Button, Card, Dialog, Dropdown, Input, Select, Textarea, Badge, Titlebar, Toaster). Tailwind-Tokens via `src/lib/theme.svelte.ts` (Light/Dark/System).
- **Lucide Icons** (`@lucide/svelte`)
- **svelte-spa-router** — Routing (lightweight, kein SvelteKit)
- **Superforms + Zod** — Forms & Validation
- **Sonner-Svelte** — Toasts
- **TanStack Table for Svelte** — Tabellen (Kunden/Rechnungsliste)

### Persistence
- **tauri-plugin-sql** (SQLite)
- **Drizzle ORM** — Schema + Migrations

### Backend (Sidecar)
- **Python 3.12**
- **factur-x** — ZUGFeRD-XML-Generierung + PDF/A-3-Embedding
- **WeasyPrint** — HTML/CSS → PDF/A-3 Rendering
- **Jinja2** — PDF-Template-Rendering
- **PyInstaller** — Sidecar-Bundling pro Plattform

### Tooling
- **GitHub Actions** — CI/CD, Matrix-Builds für alle Plattformen
- **pnpm** — Package Manager
- **Biome** — Linter/Formatter (oder ESLint+Prettier falls Probleme)
- **Vitest** — Frontend-Tests (sparsam)
- **pytest** — Sidecar-Tests

---

## 5. Architektur

```
┌─────────────────────────────────────────┐
│   Svelte 5 Frontend (Tauri WebView)     │
│   - Routes: Dashboard, Kunden,           │
│     Rechnungen, Settings                 │
│   - Bits UI Components (default styled)  │
│   - State via Runes ($state, $derived)   │
└────────────────┬────────────────────────┘
                 │ tauri-plugin-sql
                 ▼
         ┌───────────────┐
         │  SQLite DB    │
         │  (lokal,      │
         │   ~/AppData)  │
         └───────────────┘

┌─────────────────────────────────────────┐
│   Rust Backend (src-tauri)              │
│   - Bridge zum Sidecar via Commands     │
│   - File-System (PDF-Speicherort)       │
│   - Dialog (Save-As, Open-File)         │
└────────────────┬────────────────────────┘
                 │ stdin/stdout (JSON-RPC)
                 ▼
┌─────────────────────────────────────────┐
│   Python Sidecar (PyInstaller-Binary)   │
│   - JSON-Request rein → PDF-Path raus    │
│   - factur-x: ZUGFeRD-XML + Embedding   │
│   - WeasyPrint: HTML → PDF/A-3          │
│   - Jinja2: Invoice-Templates           │
└─────────────────────────────────────────┘
```

### Daten-Fluss „Rechnung erzeugen"

1. User klickt „PDF erzeugen" im Frontend
2. Svelte ruft Tauri-Command `generate_invoice(invoiceId)` auf
3. Rust lädt Invoice + Items + Customer + Settings aus SQLite
4. Rust spawnt Python-Sidecar, sendet JSON via stdin
5. Python rendert HTML via Jinja2 → PDF/A-3 via WeasyPrint → embedded ZUGFeRD-XML via factur-x
6. Python schreibt Datei nach `~/Documents/Faktura/Rechnungen/RE-2026-0001.pdf`
7. Python returnt JSON mit Pfad + Warnings
8. Rust gibt Pfad an Frontend zurück
9. Frontend zeigt PDF in Modal (via Tauri `shell.open()`)

---

## 6. Datenmodell (Drizzle / SQLite)

### `settings` (Singleton, id = 1)

```typescript
{
  id: number,                    // immer 1
  companyName: string,
  ownerName: string,
  street: string,
  postalCode: string,
  city: string,
  country: string,               // default "DE"
  taxNumber: string,             // Steuernummer
  vatId: string | null,          // USt-IdNr. (optional bei KU)
  email: string,
  phone: string | null,
  website: string | null,
  bankName: string,
  bankIban: string,
  bankBic: string,
  isKleinunternehmer: boolean,   // §19 UStG
  kleinunternehmerNote: string,  // Standardtext, editierbar
  invoiceNumberFormat: string,   // "RE-{YYYY}-{NNNN}"
  invoiceNumberCounter: number,
  defaultPaymentTermsDays: number,  // default 14
  logoPath: string | null,
  createdAt: number,
  updatedAt: number
}
```

### `customers`

```typescript
{
  id: number,
  customerNumber: string,        // fortlaufend, K-0001
  name: string,
  contactPerson: string | null,
  street: string,
  postalCode: string,
  city: string,
  country: string,
  email: string | null,
  phone: string | null,
  vatId: string | null,
  notes: string | null,
  createdAt: number,
  updatedAt: number
}
```

### `invoices`

```typescript
{
  id: number,
  number: string,                // RE-2026-0001, immutable nach Versand
  customerId: number,
  customerSnapshot: string,      // JSON-Snapshot zum Zeitpunkt der Erstellung
  issueDate: number,
  deliveryDate: number | null,
  dueDate: number,
  status: 'draft' | 'sent' | 'paid' | 'cancelled',
  subtotal: number,              // in Cent
  vatAmount: number,             // in Cent
  total: number,                 // in Cent
  isKleinunternehmer: boolean,   // Snapshot (kann sich später ändern)
  notes: string | null,
  paymentTerms: string | null,
  pdfPath: string | null,
  createdAt: number,
  updatedAt: number,
  sentAt: number | null,
  paidAt: number | null
}
```

### `invoice_items`

```typescript
{
  id: number,
  invoiceId: number,
  position: number,              // 1, 2, 3, ...
  description: string,
  quantity: number,
  unit: string,                  // 'h', 'Stk', 'Pauschal', 'Tag', etc.
  unitPrice: number,             // in Cent
  vatRate: number,               // 0, 7, 19 — bei KU immer 0
  lineTotal: number              // in Cent
}
```

**Convention:** Geldbeträge intern immer in **Cent als Integer** speichern, erst bei Darstellung in EUR konvertieren. Vermeidet Floating-Point-Probleme.

---

## 7. ZUGFeRD / E-Rechnungs-Compliance

### Profil
- **Default: EN 16931 (Comfort)** — universell akzeptiert, deckt alle B2B-Standardfälle
- Konfigurierbar: BASIC für minimalen Datensatz, EXTENDED für maximale Felder
- Profil wird in Settings einstellbar

### XML-Generierung
- Via `factur-x` Python-Library
- EN 16931-konform
- Embedded in PDF/A-3 (factur-x erledigt das)

### Kleinunternehmer-Spezialfall
- Kein VAT-Ausweis im XML (`<ram:CategoryCode>E</ram:CategoryCode>` für „Exempt")
- Pflicht-Hinweistext: „Gemäß § 19 UStG enthält die Rechnung keinen Umsatzsteuerausweis."
- Steuernummer trotzdem Pflichtfeld

### Validierung
- Während Entwicklung: manueller Upload zu [erechnungs-validator.de](https://erechnungs-validator.de) bei Test-Rechnungen
- In CI: Optional `mustangproject` CLI als Validator-Step
- Sidecar gibt Warnings zurück, die im Frontend angezeigt werden

### Rechtshinweise (für README)
- Keine Rechts- oder Steuerberatung
- Keine Garantie auf rechtliche Korrektheit
- Eigenverantwortung des Nutzers
- Empfehlung: erste Rechnungen vom Steuerberater prüfen lassen

---

## 8. UI / Pages

**Wichtig:** Eigene UI-Schicht unter `src/lib/ui/` (shadcn-Stil, Bits-UI-Primitives darunter). Konsistente Tokens via `theme.svelte.ts`, Lucide-Icons, Light/Dark/System. Layout via Tailwind v4. Funktionalität bleibt vor Optik — aber Optik ist nicht mehr „nackt".

### Routen

| Route | Beschreibung |
|---|---|
| `/` | Dashboard — Quick-Stats, letzte Rechnungen, schnelle Aktionen |
| `/customers` | Kundenliste mit Suche + Filter |
| `/customers/new` | Neuer Kunde |
| `/customers/:id` | Kunden-Detail + Edit |
| `/invoices` | Rechnungsliste mit Filter (Status, Jahr, Kunde) |
| `/invoices/new` | Rechnungs-Editor (Multi-Step) |
| `/invoices/:id` | Rechnungs-Detail + Edit (nur Drafts) |
| `/settings` | Firmendaten, Steuer, Nummernkreis, Logo |

### Dashboard
- Card: offene Rechnungen (Summe + Anzahl)
- Card: bezahlt YTD
- Card: überfällige Rechnungen
- Liste: letzte 10 Rechnungen
- Quick-Action-Buttons: „Neue Rechnung", „Neuer Kunde"

### Rechnungs-Editor (Multi-Step oder Single-Page-Form)
- Step 1: Kunde auswählen oder neu anlegen
- Step 2: Positionen (dynamische Liste, hinzufügen/entfernen)
- Step 3: Zahlungsbedingungen, Notizen, Liefer-/Leistungsdatum
- Step 4: Zusammenfassung + Generieren-Button

**Phase-1-Vereinfachung:** Single-Page-Form ist okay, Multi-Step kann später kommen.

---

## 9. Projekt-Struktur

```
faktura/
├── src/                          # Svelte Frontend
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── dashboard/+page.svelte
│   │   ├── customers/
│   │   ├── invoices/
│   │   └── settings/
│   ├── lib/
│   │   ├── components/           # Dünne Wrapper um Bits UI, sonst nichts
│   │   ├── db/
│   │   │   ├── schema.ts         # Drizzle Schema
│   │   │   ├── migrations/
│   │   │   └── queries.ts
│   │   ├── sidecar/
│   │   │   └── invoice.ts        # Tauri-Command-Wrappers
│   │   ├── stores/
│   │   │   └── settings.svelte.ts
│   │   ├── types/
│   │   └── utils/
│   │       ├── money.ts          # Cent ↔ EUR
│   │       ├── invoice-number.ts # Counter-Logic
│   │       └── date.ts
│   ├── app.css                   # Tailwind v4 imports + Bits UI base
│   └── main.ts
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands.rs           # Sidecar-Bridge
│   │   └── lib.rs
│   ├── binaries/                 # Compiled sidecars per platform
│   │   ├── invoice-gen-x86_64-pc-windows-msvc.exe
│   │   ├── invoice-gen-x86_64-apple-darwin
│   │   ├── invoice-gen-aarch64-apple-darwin
│   │   └── invoice-gen-x86_64-unknown-linux-gnu
│   ├── Cargo.toml
│   └── tauri.conf.json
├── sidecar/                      # Python source
│   ├── main.py                   # Entry: JSON via stdin/stdout
│   ├── invoice/
│   │   ├── __init__.py
│   │   ├── pdf.py                # WeasyPrint integration
│   │   ├── zugferd.py            # factur-x integration
│   │   ├── templates.py          # Jinja2 setup
│   │   └── validate.py
│   ├── templates/
│   │   ├── invoice.html.j2       # Default Invoice template
│   │   └── invoice.css           # PDF-spezifisches CSS
│   ├── tests/
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── build.py                  # PyInstaller config
├── .github/
│   └── workflows/
│       ├── build.yml             # Matrix build (Win/Mac/Linux)
│       └── release.yml
├── README.md
├── CONTRIBUTING.md
├── LICENSE                       # MIT
├── CLAUDE.md                     # Claude Code instructions
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

---

## 10. Sidecar-Interface (JSON-RPC)

### Request (stdin)

```json
{
  "command": "generate_invoice",
  "payload": {
    "invoice": { /* full Invoice object */ },
    "items": [ /* InvoiceItems */ ],
    "company": { /* Settings */ },
    "customer": { /* Customer snapshot */ },
    "outputPath": "/path/to/output.pdf",
    "profile": "EN16931"
  }
}
```

### Response (stdout)

```json
{
  "success": true,
  "pdfPath": "/path/to/output.pdf",
  "validationWarnings": [],
  "validationErrors": []
}
```

### Error-Response

```json
{
  "success": false,
  "error": {
    "code": "TEMPLATE_RENDER_FAILED",
    "message": "...",
    "details": "..."
  }
}
```

### Weitere Commands (später)
- `validate_invoice` — XML/PDF validieren ohne neu generieren
- `extract_zugferd` — XML aus existierender ZUGFeRD-Datei extrahieren (für „Eingangsrechnung lesen"-Feature)

---

## 11. Milestones

### M1 — Grundgerüst ✅
- [x] Tauri 2 + Svelte 5 + TS + Vite Setup
- [x] Tailwind v4 + Bits UI installation
- [x] svelte-spa-router routing
- [x] SQLite + Drizzle Schema + Migrations
- [x] Settings-Page mit Persistence
- [x] Kunden-CRUD komplett

### M2 — Rechnungen ohne PDF ✅
- [x] Rechnungs-Schema + Migrations
- [x] Rechnungs-Liste mit Filtern
- [x] Rechnungs-Editor (Single-Page-Form)
- [x] Invoice-Numbering-Logic
- [x] Customer-Snapshot-Mechanik
- [x] Status-Management (Draft → Sent → Paid)

### M3 — Python Sidecar + PDF ✅
- [x] Python-Projekt-Setup
- [x] JSON-Protokoll via stdin/stdout
- [x] WeasyPrint Setup
- [x] HTML/CSS Invoice-Template
- [x] Jinja2-Integration
- [x] Frontend: PDF via `openPath` im System-Viewer öffnen
- *Note:* PyInstaller + externalBin in M5 verschoben (Reihenfolge praktischer).

### M4 — ZUGFeRD-Integration ✅
- [x] factur-x Integration
- [x] XML-Generierung (EN 16931 Comfort)
- [x] PDF/A-3-Konformität (`pdf_variant="pdf/a-3b"`)
- [x] Embedding via `factur-x.generate_from_binary`
- [x] Kleinunternehmer-Spezialfall (BR-CO-26 via BT-29-Fallback)
- [x] Profil-Selector in Settings (nur EN16931 aktiv in v0.1; BASIC/EXTENDED disabled bis eigene Templates existieren)

### M5 — Cross-Platform + Polish ✅ (Win-Build verifiziert)
- [x] PyInstaller Bundle für Windows (`sidecar/build.py`, onedir + GTK-DLLs)
- [x] Tauri externalBin via `bundle.resources` + Dev/Release-Split in `sidecar.rs`
- [x] Windows MSI + NSIS-Installer gebaut, installiert, sidecar funktioniert end-to-end
- [x] GitHub Actions Matrix (Win/macOS-arm/Linux — macOS-x86 entfernt wegen langsamer Intel-Builds, siehe v0.2.0-Notiz)
- [x] README, CONTRIBUTING, CODE_OF_CONDUCT, Disclaimer
- [x] macOS + Linux Builds grün (ab v0.2.0)
- [x] README-Screenshots ergänzt

### M6 — OSS-Release ✅
- [x] Repo öffentlich auf GitHub: `jonax1337/zettel`
- [x] GitHub Discussions aktiviert
- [x] Issue-Templates (Bug, Feature, ZUGFeRD-Validierung) + PR-Template
- [x] README modernisiert (for-the-badge style, Hero-Section, Disclaimer)
- [x] CHANGELOG.md eingeführt
- [x] Tag `v0.1.0` → CI-Release-Job (Cross-Platform-Artefakte gebaut)
- [ ] Demo-Video / GIF (manuell aufzunehmen)
- [ ] Launch: HN, r/selbststaendig, r/Freelance_DE, Mastodon

### v0.2.0 ✅ — released
- Reverse-Charge / intra-EU B2B (CategoryCode K, ExemptionReason)
- BASIC + EXTENDED ZUGFeRD-Profile (URN parametrisiert)
- DATEV-Export (CSV, Format 700, SKR03/SKR04)
- Backup / Restore (ZIP, staged restore beim nächsten Start)
- Wiederkehrende Rechnungen (Vorlagen, Dashboard-Widget, manuelle Erzeugung)
- `.gitattributes` (LF-Pinning, `include_str!`-Migrations byte-stabil)

### v0.3.x ✅ — released
- Angebote (`/offers`, eigene Tabelle, Konvertierung zu Rechnung)
- Stornorechnungen / Credit Notes mit EN-16931-konformem CII-XML

### v0.4.x ✅ — released (zuletzt v0.4.3)
- PDF-Theme-System (classic / modern / minimal) — gilt für Rechnungen **und** Angebote
- Reverse-Charge Drittland (CategoryCode G statt K)
- Granularer Restore (Kunden / Rechnungen / Settings selektiv)
- Backup-Verschlüsselung (AES-256-GCM, passwortgeschützte ZIPs)
- „Aus Rechnung Vorlage erstellen"-Button (Recurring Templates)
- PDF/A-3b für Angebote (kein ZUGFeRD-XML, aber Archivierungs-konform)
- **Auto-Update** via Tauri Updater (Ed25519-signiert, statisches `latest.json` bei GitHub Releases)
- v0.4.3 Fix: `bundle.createUpdaterArtifacts` + NSIS-Sig-Pfade für Tauri-2 korrigiert (erstes echtes Update-fähiges Release)

---

### v0.5.0 ✅ — „Buchhaltungs-Light" (released 2026-05-16)

**Roter Faden:** Bisher konnte Zettel nur Ausgangsbelege. v0.5 macht den Gegenpol auf — Eingangsrechnungen, Lieferanten, einfache Saldo-Übersicht. Detail-Spec in `Areas/Zettel/Features/v0.5.0-buchhaltung-light.md` (Obsidian).

**Kern-Features:**
- [ ] **Eingangsrechnungen** — Route `/expenses`, Tabellen `expenses` + `expense_items`
  - [ ] ZUGFeRD/Factur-X-XML aus eingehenden PDFs extrahieren (neuer Sidecar-Command `extract_zugferd`)
  - [ ] Manueller Erfassungs-Fallback (Lieferant, Datum, Betrag, USt, Kategorie)
  - [ ] PDF-Ablage unter `~/Documents/Zettel/Eingangsrechnungen/`
  - [ ] Status: offen / bezahlt / storniert
- [ ] **Lieferanten** (`vendors`) — eigene Tabelle, Route `/vendors`, analog Customers
- [ ] **Kategorien / Kostenstellen** — Free-Text mit Autocomplete (Bürobedarf, Software, Reise, …). Spätere DATEV-Konten-Mapping als Bonus
- [ ] **DATEV-Export erweitert**
  - [ ] Eingangsrechnungen mit aufnehmen (Aufwandskonten)
  - [ ] **Stornobuchungen** als negative Beträge (Carry-over aus v0.3+)
- [ ] **Dashboard-Erweiterung**
  - [ ] Card „Offene Eingangsrechnungen"
  - [ ] Card „Ausgaben YTD"
  - [ ] Mini-Saldo: Einnahmen YTD − Ausgaben YTD (kein EÜR-Ersatz, nur Indikator)

**Stretch / optional:**
- [ ] UStVA-Vorbereitungs-Report pro Quartal (CSV/PDF zum Abtippen, **kein** ELSTER-Upload)
- [ ] Wiederkehrende Eingangsrechnungen (Hosting, Software-Abos) — analog zum bestehenden Recurring-Feature

**Bewusst nicht in v0.5:**
- Banking-Anbindung (FinTS) — bleibt Non-Goal
- GoBD-zertifizierte Archivierung — Disclaimer wie immer
- OCR für Nicht-ZUGFeRD-PDFs (v0.6+)

### v0.6.0 ✅ — Mahnwesen + OCR-Light (released 2026-05-17)
- **Mahnungen als first-class Dokumente** (`/reminders`, `MA-YYYY-NNNN`, eigene `reminders`-Tabelle + PDF-Template). 3 Stufen: Zahlungserinnerung / Mahnung / Letzte Mahnung. Snapshot der Original-Rechnung, Mahngebühr + Verzugszinsen.
- **Überfällige-Rechnungen-Widget** in `/reminders` + kontextsensitiver Mahn-Button in `InvoiceDetail`.
- **OCR-Light für Eingangsrechnungen** (`extract_text_pdf` via pypdf-Text-Layer + Regex-Heuristik). Fallback wenn keine ZUGFeRD-XML vorhanden. **Kein Tesseract** — reine Scans bleiben manuell.
- **Fix:** `CURRENT_SCHEMA` in `backup.rs` war seit v0.5 verzettelt auf 9 — auf 11 gezogen.

### v0.7+ / Backlog (nicht für v0.6 geplant)
- Tesseract-OCR für gescannte Eingangsrechnungen (würde Bundle um ~30 MB aufblähen — bewusst verschoben)
- I18n (englische UI)
- Mehrere PDF-Themes über die bestehenden 3 hinaus
- Mahnwesen-Settings-UI (heute nur über DB-Defaults; Templates pro Mahnung im Editor änderbar)
- Wiederkehrende Eingangsrechnungen (Hosting, Software-Abos)
- ELSTER-Anbindung (würde Non-Goal aufweichen — explizit prüfen)
- Backup-Cloud-Upload (S3-kompatibel)
- Automatischer Mahn-Versand per SMTP (würde „offline-first" verwässern)

---

## 12. Offene Fragen / Entscheidungen

- **Name:** Faktura, Zettel, Belegbox, Faktor, andere? → entscheiden vor M1
- **PDF-Output-Pfad:** `~/Documents/Faktura/` als Default oder konfigurierbar in Settings? → konfigurierbar, Default vorschlagen
- **Logo-Format:** PNG only oder auch SVG? → PNG für Phase 1 (WeasyPrint kann SVG, aber PNG ist robuster)
- **Backup/Export:** ZIP mit DB-Dump + alle PDFs? → ✅ in v0.2 implementiert (`src-tauri/src/backup.rs`)
- **Update-Mechanismus:** Tauri Updater (selfsigned) oder GitHub Releases manuell? → GitHub Releases für v1, Updater Phase 2
- **Code-Signing:** unsigned für v1 (User akzeptiert SmartScreen-Warning), später Cert? → unsigned v1
- **Telemetrie:** keine. Punkt.

---

## 13. Lizenz & OSS

- **MIT License** — maximale Adoption, minimale Reibung
- **Disclaimer** prominent in README: keine Rechtsberatung, keine Gewähr, Eigenverantwortung
- **CONTRIBUTING.md** mit Setup-Guide für Frontend + Sidecar
- **CODE_OF_CONDUCT.md** — Contributor Covenant
- **Semantic Versioning** (0.x bis stabil, dann 1.0)
- **Conventional Commits** für Changelog-Generierung

---

## 14. Risiken & Mitigations

| Risiko | Impact | Mitigation |
|---|---|---|
| PDF/A-3-Konformität schwer zu erreichen | Hoch | factur-x kümmert sich um Embedding; WeasyPrint-PDF zuerst manuell durch validator |
| PyInstaller-Bundle wird zu groß | Mittel | Minimaler Python-Deps, ggf. UPX-Komprimierung |
| Cross-Compile Sidecar von einer Plattform aus | Mittel | GitHub Actions Matrix: jede Plattform baut ihr eigenes Sidecar |
| UI-Schicht über Bits UI wächst zum eigenen Design-System | Niedrig | Bewusst akzeptiert; shadcn-Stil bleibt eng am Standard, keine Custom-Animationen oder Brand-Tokens. |
| Rechtliche Unsicherheit ZUGFeRD-Details | Hoch | Disclaimer + Validator + Steuerberater-Hinweis |
| Svelte-5-Tooling/AI-Support noch nicht so reif wie React | Niedrig | Bewusst akzeptiert, manueller Code-Review häufiger |

---

## 15. Definition of Done für v1.0

- [x] Kunden anlegen, editieren, löschen
- [x] Rechnungen anlegen, editieren (im Draft-Status), generieren
- [x] Generierte PDFs sind ZUGFeRD/Factur-X EN16931-konform (validiert)
- [x] Kleinunternehmer-Modus funktioniert vollständig (BR-CO-26 OK)
- [x] Settings persistent, Logo-Upload funktioniert
- [x] Mindestens 5 manuell generierte Test-Rechnungen erfolgreich gegen erechnungs-validator.de validiert (Stand 2026-05-16, 5/5 grün)
- [x] Windows-Build (MSI + NSIS) erfolgreich installiert + smoke-getestet
- [x] README mit Quickstart + Disclaimer (Screenshots-Placeholder)
- [x] Cross-Platform-Builds (Win/macOS-arm/Linux) als GitHub Release verfügbar
- [x] Repo öffentlich auf GitHub (`jonax1337/zettel`)
- [x] README-Screenshots ergänzt
- [x] Auto-Update funktioniert (v0.4.3 erstes Update-fähiges Release)
