# Zettel

**Offline-first Rechnungs-Generator für deutsche Freelancer und Kleinunternehmer.**
Erzeugt **ZUGFeRD / Factur-X**-konforme PDF/A-3-Rechnungen mit eingebettetem EN 16931-XML — lokal, ohne Cloud, ohne Abo.

> Status: **v0.1** — M1–M5 abgeschlossen, EN 16931-Validierung erfolgreich gegen [erechnungs-validator.de](https://erechnungs-validator.de).

<!-- TODO: Screenshot Dashboard, Settings, Rechnungs-Editor -->

## Was Zettel macht

- **Kunden & Rechnungen** lokal verwalten (SQLite, keine Cloud)
- **PDF/A-3 mit ZUGFeRD/Factur-X EN 16931** generieren — die Rechnung sieht aus wie eine normale PDF, enthält aber gleichzeitig die EN-16931-XML-Daten als Anhang
- **Kleinunternehmer-Modus** (§19 UStG) als First-Class-Feature: korrekte Steuerausweisung, automatischer Hinweistext
- **Mehrere USt-Sätze** pro Rechnung (0%, 7%, 19%)
- **Logo-Upload** für Rechnungs-Header
- **Status-Workflow**: Entwurf → Versandt → Bezahlt

## Was Zettel NICHT macht

❌ Vollständige Buchhaltung (EÜR, BWA, Bilanz)
❌ Banking / Kontoabgleich
❌ Cloud-Sync oder Mehrbenutzer
❌ Mobile App
❌ Eingangsrechnungs-Verarbeitung *(geplant für v0.3)*

## Installation

Vorgefertigte Installer findest du unter [Releases](https://github.com/jonax1337/zettel/releases) — für Windows (MSI/NSIS), macOS (DMG) und Linux (AppImage/deb).

**Windows:** Beim ersten Start zeigt SmartScreen eine Warnung (das Binary ist nicht code-signiert). Auf „Weitere Informationen" → „Trotzdem ausführen" klicken.

**Linux/macOS:** WeasyPrint braucht Pango/Cairo aus dem System.
```bash
# Ubuntu/Debian
sudo apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0
# macOS
brew install pango cairo gdk-pixbuf
```

## Quickstart

1. **Einstellungen** öffnen, Firmendaten + Steuernummer ausfüllen
2. **Kunde** anlegen
3. **Neue Rechnung** → Kunde wählen → Positionen einfügen → speichern
4. **PDF generieren** — landet unter `~/Documents/Zettel/Rechnungen/RE-2026-0001.pdf`

## Entwicklung

```bash
pnpm install
pnpm tauri:dev
```

Sidecar-Setup (für PDF-Generierung in Dev): siehe [`sidecar/README.md`](./sidecar/README.md).

Release-Build inkl. PyInstaller-Sidecar-Bundle:
```bash
cd sidecar && python build.py && cd ..
pnpm tauri:build
```

Vollständige Architektur, Datenmodell und Plan: [`PLAN.md`](./PLAN.md), [`CLAUDE.md`](./CLAUDE.md).
Mitmachen: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Tech-Stack (Kurzfassung)

- **Frontend:** Tauri 2, Svelte 5 (Runes), TypeScript strict, Tailwind v4, Bits-UI-Primitives mit shadcn-Style-Wrappern unter `src/lib/ui/`, Lucide-Icons, Light/Dark/System-Theme
- **Persistenz:** SQLite (lokal, `~/AppData/.../zettel.db`)
- **PDF/XML:** Python-Sidecar (WeasyPrint + factur-x + Jinja2), als PyInstaller-Binary gebündelt

## Disclaimer

⚠️ **Zettel ist keine Rechts- oder Steuerberatung.**
Die Software gibt keinerlei Garantie auf rechtliche Korrektheit, Vollständigkeit oder Konformität der erzeugten Rechnungen mit aktuell geltendem Steuer- oder Handelsrecht.
**Nutzung auf eigene Verantwortung.** Lass die ersten erzeugten Rechnungen von deinem Steuerberater prüfen, bevor du sie an Kunden versendest.

## Lizenz

[MIT](./LICENSE) — Jonas Laux & Contributors.
