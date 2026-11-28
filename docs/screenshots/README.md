# Screenshots

Dieser Ordner enthält die Bilder, die im Haupt-README und auf der Projekt-Landing-Page verwendet werden. Bitte beim Erzeugen folgende Konventionen einhalten — das hält das README konsistent und vermeidet Layout-Sprünge.

## Konventionen

- **Format:** PNG mit transparentem oder hellem Hintergrund (passend zum Light-Theme); WebP zusätzlich willkommen
- **Auflösung:** 1440×900 (16:10) für Vollbild-Screens; doppelt für Retina-Displays nicht zwingend nötig
- **Theme:** Light-Theme als Default; ein paar Dark-Mode-Variante als `*-dark.png`
- **Daten:** ausschließlich anonymisierte / fingierte Daten (Musterfirma GmbH, Max Mustermann, etc.) — **niemals** echte Kundennamen, Steuernummern, USt-IDs oder Beträge
- **Dateinamen:** `kebab-case`, sprechend, z.B. `dashboard.png`, `invoice-edit.png`, `expense-drop-zone.png`
- **Größe:** vor dem Commit mit `pngquant` oder `oxipng` komprimieren (Ziel < 300 KB pro Bild)

## Motive

Das README bindet 3–6 starke Bilder ein. Vorhanden sind:

| Datei | Motiv |
|---|---|
| `dashboard.png` | Übersicht (`/`) mit „Zu erledigen“, Gewinn, Einnahmen und Ausgaben, offenen Forderungen |
| `invoices.png` | `/invoices` — Rechnungsliste mit Status und Filtern |
| `invoice-validated.png` | Rechnungsseite mit dem Beleg als Blatt; in der Seitenspalte Zahlung, PDF-Versionen und die bestandene KoSIT-Prüfung |
| `pdf-preview.png` | generiertes PDF in einem Viewer mit sichtbaren ZUGFeRD-XML-Attachments |
| `expenses.png` | `/expenses` — Ausgaben mit Lieferanten, Kategorie und Status |
| `ustva.png` | UStVA-Vorbereitung (Auswertungen → UStVA) |
| `zettel-demo.gif` | Rundgang durch die App (Übersicht, Rechnungen, geprüfte Rechnung als Blatt, Ausgaben, UStVA), 960×600 |

Gewünscht und noch nicht vorhanden (neu seit v0.24):

- `time-tracking.png` — `/time` (Zeiten) mit Timer, Tagesliste und „Offene Zeiten abrechnen“
- `euer.png` — Auswertungen → Anlage EÜR mit den Zeilen des Vordrucks
- `validate.png` — Auswertungen → „E-Rechnung prüfen“ mit einem Prüfbericht
- `integrity.png` — Einstellungen → Daten und Backup mit Integritätsprüfung (GoBD) und Export des Änderungsprotokolls

Weitere optionale Motive: `invoice-edit.png` (`/invoices/new` mit mehreren Positionen, Service-Period, Multi-Currency), `settings.png` (`/settings/company` mit Unternavigation), `command-palette.png` (`Cmd/Ctrl+K`-Overlay), `backup-restore.png` (Einstellungen → Daten und Backup mit Backup-Optionen).

## Beitragen

Wenn du gute Screenshots erzeugen kannst und mitmachen willst: PR mit den Bildern in diesem Ordner + Anpassung des `Screenshots`-Abschnitts im Root-`README.md`. Bitte vorher in den **Sandbox-Modus** wechseln (Einstellungen → Daten und Backup → Sandbox), Testdaten anlegen, dann Screenshots erstellen — so kann nichts versehentlich aus den Echtdaten leaken.
