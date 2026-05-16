# Changelog

Alle nennenswerten Änderungen an Zettel werden hier dokumentiert.
Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionen folgen [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

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

[Unreleased]: https://github.com/jonax1337/zettel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jonax1337/zettel/releases/tag/v0.1.0
