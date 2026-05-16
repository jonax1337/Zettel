<div align="center">

# Zettel

**Offline-first Rechnungen für deutsche Freelancer und Kleinunternehmer.**
ZUGFeRD- / Factur-X-konforme PDF/A-3 mit eingebettetem EN-16931-XML — lokal, ohne Cloud, ohne Abo.

[![Release](https://img.shields.io/github/v/release/jonax1337/zettel?style=for-the-badge&logo=github&color=4f46e5)](https://github.com/jonax1337/zettel/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/jonax1337/zettel/build.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/jonax1337/zettel/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/github/license/jonax1337/zettel?style=for-the-badge&color=4f46e5)](./LICENSE)
[![Downloads](https://img.shields.io/github/downloads/jonax1337/zettel/total?style=for-the-badge&logo=github&color=4f46e5)](https://github.com/jonax1337/zettel/releases)
[![Stars](https://img.shields.io/github/stars/jonax1337/zettel?style=for-the-badge&logo=github&color=4f46e5)](https://github.com/jonax1337/zettel/stargazers)

[![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/jonax1337/zettel/releases)
[![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/jonax1337/zettel/releases)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/jonax1337/zettel/releases)
[![ZUGFeRD](https://img.shields.io/badge/ZUGFeRD-EN%2016931-10b981?style=for-the-badge)](https://www.ferd-net.de/)
[![Made in Germany](https://img.shields.io/badge/Made%20in-Germany-000000?style=for-the-badge&labelColor=DD0000)](https://laux.digital)

[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)

[Releases](https://github.com/jonax1337/zettel/releases)&nbsp;&nbsp;•&nbsp;&nbsp;
[Discussions](https://github.com/jonax1337/zettel/discussions)&nbsp;&nbsp;•&nbsp;&nbsp;
[Plan](./PLAN.md)&nbsp;&nbsp;•&nbsp;&nbsp;
[Changelog](./CHANGELOG.md)&nbsp;&nbsp;•&nbsp;&nbsp;
[Contributing](./CONTRIBUTING.md)

</div>

<br />

<!-- TODO: Screenshot oder Demo-GIF -->

Ich bin Solo-Selbstständiger und hatte keine Lust auf weitere 20–30 € pro Monat für SaaS-Buchhaltung, nur um ein paar Rechnungen pro Quartal zu schreiben. Zettel ist das, was dabei rausgekommen ist: ein kleines Desktop-Tool, das **lokal** läuft, die deutsche E-Rechnungs-Norm **EN 16931** korrekt umsetzt und den **Kleinunternehmer-Modus (§ 19 UStG)** als First-Class-Feature behandelt — nicht als Häkchen, das man hinter einem Premium-Tarif suchen muss.

Stand 0.1: fünf von fünf manuell erzeugten Test-Rechnungen sind grün bei [erechnungs-validator.de](https://erechnungs-validator.de). Reicht für mich, reicht hoffentlich auch für dich.

## Install

Installer für Windows, macOS und Linux gibt's unter [Releases](https://github.com/jonax1337/zettel/releases).

| Plattform | Format | Hinweis |
|---|---|---|
| Windows 10/11 | `.msi`, `.exe` (NSIS) | Erster Start: SmartScreen → *Weitere Informationen → Trotzdem ausführen* |
| macOS 13+ | `.dmg` (Apple Silicon + Intel) | Nicht notarisiert — Rechtsklick → *Öffnen* beim ersten Start |
| Linux | `.deb` (Ubuntu 22.04+) | Pango/Cairo nötig (s. u.) |

Auf Linux und macOS braucht WeasyPrint Pango, Cairo und gdk-pixbuf aus dem System:

```bash
# Ubuntu / Debian
sudo apt install libpango1.0-0 libcairo2 libgdk-pixbuf2.0-0

# macOS
brew install pango cairo gdk-pixbuf
```

## Quickstart

1. **Einstellungen** öffnen, Firmendaten und Steuernummer eintragen
2. **Kunde** anlegen
3. **Neue Rechnung** → Kunde wählen → Positionen eintragen → speichern
4. **PDF erzeugen** → liegt unter `~/Documents/Zettel/Rechnungen/RE-2026-0001.pdf`

## Was drin ist

Kunden- und Rechnungsverwaltung lokal in SQLite. PDF/A-3-Rechnungen mit eingebettetem Factur-X-XML im Profil **EN 16931**. Kleinunternehmer-Modus inklusive korrektem `CategoryCode E` und BR-CO-26-konformem `BT-29`-Fallback, wenn keine USt-IdNr. vorhanden ist. Mehrere USt-Sätze pro Rechnung (0 %, 7 %, 19 %). Status-Workflow Entwurf → Versandt → Bezahlt → Storniert. Konfigurierbare Nummernkreise, Logo-Upload, Customer-Snapshot pro Rechnung.

## Was nicht drin ist

Keine vollständige Buchhaltung, kein Banking, kein Cloud-Sync, keine Mobile-App. Reverse-Charge und intra-EU-B2B sind für v0.2 geplant, Eingangsrechnungen einlesen für v0.3. Die vollständigen Non-Goals stehen in [`PLAN.md`](./PLAN.md#3-non-goals-explizit-ausgeschlossen) — bitte vor einem Feature-Request kurz reinschauen.

## Stack

Tauri 2 + Svelte 5 (Runes) + TypeScript strict + Tailwind v4. UI als shadcn-Style-Layer über Bits-UI-Primitives unter `src/lib/ui/`. Persistenz über `tauri-plugin-sql` direkt auf SQLite. PDF und ZUGFeRD-XML rendert ein Python-Sidecar (WeasyPrint, factur-x, Jinja2), gebundelt per PyInstaller und als Tauri-Resource ausgeliefert. Architektur, Datenmodell und Sidecar-Protokoll: [`PLAN.md`](./PLAN.md) und [`CLAUDE.md`](./CLAUDE.md).

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

Contributor-Setup, Konventionen und Bauanleitung pro Plattform: [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Disclaimer

Zettel ist keine Rechts- oder Steuerberatung und gibt keinerlei Garantie auf rechtliche Korrektheit der erzeugten Rechnungen. Nutzung auf eigene Verantwortung. Die ersten Rechnungen vor dem Versand vom Steuerberater prüfen lassen.

## Lizenz

[MIT](./LICENSE) — © Jonas Laux & Contributors · [laux.digital](https://laux.digital)
