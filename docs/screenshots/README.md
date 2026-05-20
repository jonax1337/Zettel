# Screenshots

Dieser Ordner enthält die Bilder, die im Haupt-README und auf der Projekt-Landing-Page verwendet werden. Bitte beim Erzeugen folgende Konventionen einhalten — das hält das README konsistent und vermeidet Layout-Sprünge.

## Konventionen

- **Format:** PNG mit transparentem oder hellem Hintergrund (passend zum Light-Theme); WebP zusätzlich willkommen
- **Auflösung:** 1440×900 (16:10) für Vollbild-Screens; doppelt für Retina-Displays nicht zwingend nötig
- **Theme:** Light-Theme als Default; ein paar Dark-Mode-Variante als `*-dark.png`
- **Daten:** ausschließlich anonymisierte / fingierte Daten (Musterfirma GmbH, Max Mustermann, etc.) — **niemals** echte Kundennamen, Steuernummern, USt-IDs oder Beträge
- **Dateinamen:** `kebab-case`, sprechend, z.B. `dashboard.png`, `invoice-edit.png`, `expense-drop-zone.png`
- **Größe:** vor dem Commit mit `pngquant` oder `oxipng` komprimieren (Ziel < 300 KB pro Bild)

## Empfohlene Motive

Für das README reichen 3–5 starke Bilder:

1. **`dashboard.png`** — `/` mit gefülltem Period-Switcher, KPIs, Top-Kunden, Steuer-Rücklage
2. **`invoice-edit.png`** — `/invoices/new` oder `/invoices/<id>/edit` mit mehreren Positionen, Service-Period, Multi-Currency
3. **`pdf-preview.png`** — generiertes PDF in einem Viewer mit sichtbaren ZUGFeRD-XML-Attachments
4. **`expense-drop-zone.png`** — `/expenses` mit Drop-Zone und einer geparsten Lieferanten-Rechnung
5. **`settings.png`** — `/settings` Hub-Seite mit den fünf Kategorien

Optional:

- `ustva-report.png` — `/ustva` für eine Vorlage
- `command-palette.png` — `Cmd/Ctrl+K`-Overlay
- `backup-restore.png` — Settings → Daten mit Backup-Optionen

## Beitragen

Wenn du gute Screenshots erzeugen kannst und mitmachen willst: PR mit den Bildern in diesem Ordner + Anpassung des `Screenshots`-Abschnitts im Root-`README.md`. Bitte vorher in den **Sandbox-Modus** wechseln (Settings → Daten → Sandbox), Testdaten anlegen, dann Screenshots erstellen — so kann nichts versehentlich aus den Echtdaten leaken.
