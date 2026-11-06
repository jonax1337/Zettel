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
| `dashboard.png` | `/` mit gefülltem Period-Switcher, KPIs, Top-Kunden, Steuer-Rücklage |
| `invoices.png` | `/invoices` — Rechnungsliste mit Status und Filtern |
| `invoice-validated.png` | Rechnung mit bestandener KoSIT-Prüfung |
| `pdf-preview.png` | generiertes PDF in einem Viewer mit sichtbaren ZUGFeRD-XML-Attachments |
| `expenses.png` | `/expenses` — Eingangsrechnungen mit Lieferanten und Status |
| `ustva.png` | UStVA-Vorbereitung (Auswertung → UStVA) |
| `zettel-demo.gif` | Rundgang durch die App (Dashboard, Rechnungen, Validierung, PDF, Eingangsrechnungen, UStVA) |

Gewünscht und noch nicht vorhanden (neu seit v0.24):

- `time-tracking.png` — `/time` (Zeiterfassung) mit Timer, Periodenliste und dem Abrechnen-Dialog
- `euer.png` — Auswertung → Anlage EÜR mit den Zeilen des Vordrucks
- `validate.png` — Sidebar „E-Rechnung validieren“ mit einem Prüfbericht
- `integrity.png` — Einstellungen → Daten mit Integritätsprüfung (GoBD) und Export des Änderungsprotokolls

Weitere optionale Motive: `invoice-edit.png` (`/invoices/new` mit mehreren Positionen, Service-Period, Multi-Currency), `settings.png` (`/settings` Hub), `command-palette.png` (`Cmd/Ctrl+K`-Overlay), `backup-restore.png` (Settings → Daten mit Backup-Optionen).

## Beitragen

Wenn du gute Screenshots erzeugen kannst und mitmachen willst: PR mit den Bildern in diesem Ordner + Anpassung des `Screenshots`-Abschnitts im Root-`README.md`. Bitte vorher in den **Sandbox-Modus** wechseln (Settings → Daten → Sandbox), Testdaten anlegen, dann Screenshots erstellen — so kann nichts versehentlich aus den Echtdaten leaken.
