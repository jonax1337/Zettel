# Zettel

[![Release](https://img.shields.io/github/v/release/jonax1337/zettel?label=release&logo=github&color=blue)](https://github.com/jonax1337/zettel/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/jonax1337/zettel/build.yml?branch=main&logo=github)](https://github.com/jonax1337/zettel/actions/workflows/build.yml)
[![License](https://img.shields.io/github/license/jonax1337/zettel?color=blue)](./LICENSE)
[![Made with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)

Offline-first Rechnungs-Generator für deutsche Freelancer und Kleinunternehmer.
Erzeugt **ZUGFeRD / Factur-X**-konforme PDF/A-3-Rechnungen mit eingebettetem EN-16931-XML — lokal, ohne Cloud, ohne Abo.

<!-- TODO: Screenshot oder GIF -->

## Installation

Installer für Windows, macOS und Linux liegen unter [Releases](https://github.com/jonax1337/zettel/releases).

Auf Linux und macOS braucht WeasyPrint Pango/Cairo aus dem System:

```bash
# Ubuntu / Debian
sudo apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0

# macOS
brew install pango cairo gdk-pixbuf
```

Windows zeigt beim ersten Start eine SmartScreen-Warnung (kein Code-Signing) — *Weitere Informationen → Trotzdem ausführen*. macOS-Binaries sind nicht notarisiert.

## Nutzung

1. In den Einstellungen Firmendaten und Steuernummer eintragen
2. Kunden anlegen
3. Rechnung erstellen, Positionen eintragen, speichern
4. *PDF erzeugen* → liegt in `~/Documents/Zettel/Rechnungen/`

## Was drin ist

- Kunden- und Rechnungsverwaltung (lokal, SQLite)
- PDF/A-3 mit eingebettetem Factur-X-XML (Profil EN 16931)
- Kleinunternehmer-Modus nach § 19 UStG
- Mehrere USt-Sätze pro Rechnung (0 %, 7 %, 19 %)
- Status-Workflow: Entwurf → Versandt → Bezahlt → Storniert
- Konfigurierbare Nummernkreise, Logo-Upload

Validiert mit 5 von 5 Test-Rechnungen gegen [erechnungs-validator.de](https://erechnungs-validator.de).

## Was nicht drin ist

Keine Buchhaltung (EÜR, BWA, Bilanz), kein Banking, kein Cloud-Sync, keine Mobile-App, kein Reverse-Charge in 0.1. Eingangsrechnungen einlesen ist für v0.3 vorgesehen. Vollständige Non-Goals stehen in [`PLAN.md`](./PLAN.md).

## Entwicklung

```bash
pnpm install
pnpm tauri:dev
```

Release-Build inklusive Sidecar-Bundle:

```bash
cd sidecar && python build.py && cd ..
pnpm tauri:build
```

Stack: Tauri 2, Svelte 5 mit Runes, TypeScript, Tailwind v4, Bits UI mit shadcn-Style-Wrappern unter `src/lib/ui/`. Persistenz über `tauri-plugin-sql` (SQLite). PDF und ZUGFeRD-XML werden in einem Python-Sidecar (WeasyPrint + factur-x + Jinja2) erzeugt und per PyInstaller mitgebundelt.

Architektur und Datenmodell: [`PLAN.md`](./PLAN.md) · Setup für Contributor: [`CONTRIBUTING.md`](./CONTRIBUTING.md) · Konventionen: [`CLAUDE.md`](./CLAUDE.md).

## Disclaimer

Zettel ist keine Rechts- oder Steuerberatung und gibt keine Garantie auf rechtliche Korrektheit der erzeugten Rechnungen. Nutzung auf eigene Verantwortung. Die ersten Rechnungen vor dem Versand vom Steuerberater prüfen lassen.

## Lizenz

[MIT](./LICENSE) — Jonas Laux & Contributors.
