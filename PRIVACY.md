# Datenschutz / Privacy

**Kurz-Fassung:** Zettel ist eine lokale Desktop-Anwendung. Sie sendet keine Telemetrie, kein Tracking, keine Analytics. Es gibt keinen Server, der Daten empfangen könnte.

## Daten, die Zettel verarbeitet

Alle Daten bleiben auf deinem Gerät. Die Anwendung legt Dateien an folgenden Stellen ab:

| Plattform | App-Daten | Generierte PDFs |
|---|---|---|
| Windows | `%APPDATA%\digital.laux.zettel\` | `~\Documents\Zettel\` |
| macOS | `~/Library/Application Support/digital.laux.zettel/` | `~/Documents/Zettel/` |
| Linux | `~/.local/share/digital.laux.zettel/` | `~/Documents/Zettel/` |

Im App-Daten-Verzeichnis liegen:

- `zettel.db` — die SQLite-Datenbank mit Kunden, Lieferanten, Rechnungen, Angeboten, Ausgaben, Einstellungen
- `zettel-sandbox.db` — separate DB für den Sandbox-Modus (nur wenn aktiviert)
- `sandbox.flag` — Marker-Datei für den aktiven Modus
- `pending_restore/` — temporärer Ordner während eines Restore-Vorgangs (wird nach Anwendung gelöscht)

Im Documents-Verzeichnis liegen die generierten Ausgangs-PDFs (Rechnungen/Angebote/Mahnungen) und unter `Eingangsrechnungen/<vendor>/` eingelesene Lieferanten-PDFs.

**Nichts davon wird hochgeladen, gesynct oder geteilt.**

## Browser-/WebView-State

Zettel rendert seine UI in einem System-WebView (WebView2 auf Windows, WKWebView auf macOS, WebKitGTK auf Linux). Der WebView speichert intern:

- `localStorage` — UI-Präferenzen (Theme, Sidebar-State, zuletzt geöffneter Filter), keine Geschäftsdaten
- Caches für Schriftarten und gebundelte Assets

Alles davon liegt im App-Daten-Verzeichnis und verlässt das Gerät nicht.

## Ausgehende Netzwerkverbindungen

Zettel hat exakt zwei Code-Pfade, die das Internet kontaktieren — beide mit klar definierten Endpunkten:

1. **GitHub Updater** (`@tauri-apps/plugin-updater`)
   - Endpunkt: `https://github.com/jonax1337/zettel/releases/.../latest.json` und Asset-Download
   - Inhalt: nur die aktuelle App-Version wird angefragt; bei verfügbarem Update werden Installer-Binary + Ed25519-Signatur geladen
   - Frequenz: beim App-Start und manuell über Einstellungen
   - **Abschaltbar:** Updater in den Einstellungen deaktivieren, oder die App offline betreiben

2. **EZB-Wechselkurs** (`src-tauri/src/exchange.rs`)
   - Endpunkt: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`
   - Inhalt: GET-Request ohne Parameter, keine Identifikation
   - Frequenz: **nur on-demand**, wenn du eine Rechnung in einer Fremdwährung erstellst und auf „Kurs aktualisieren" klickst
   - **Abschaltbar:** einfach den Kurs manuell eintippen

Es gibt **keine** weiteren ausgehenden Verbindungen. Insbesondere:

- ❌ Kein Analytics (Google Analytics, Plausible, Matomo, Mixpanel, etc.)
- ❌ Kein Error-Reporting (Sentry, Bugsnag, Rollbar, etc.)
- ❌ Kein Telemetrie-Ping
- ❌ Keine Font-CDNs (Geist ist als `@fontsource-variable` lokal gebundelt)
- ❌ Keine Auth-Provider, keine Cloud-Sync, keine Backups in fremde Clouds

Das kannst du selbst verifizieren — z.B. mit Wireshark/Little Snitch/`tcpdump` oder schlicht offline arbeiten.

## DSGVO / GDPR

Da Zettel keine personenbezogenen Daten an einen Verantwortlichen außerhalb deines Geräts überträgt, ist Zettel selbst kein „Verarbeiter" im Sinne der DSGVO.

**Du als Nutzer bist Verantwortlicher** für die Daten deiner Kunden und Lieferanten, die du in Zettel speicherst. Das umfasst u.a.:

- Erfüllung von Auskunfts-, Berichtigungs- und Löschungs-Pflichten (Art. 15–17 DSGVO) gegenüber deinen Kunden
- Technisch-organisatorische Maßnahmen (Art. 32 DSGVO) — Geräteverschlüsselung, Backups, Zugriffsschutz auf deinen Rechner
- Aufbewahrungsfristen nach § 147 AO (siehe [`COMPLIANCE.md`](./COMPLIANCE.md))

Zettel unterstützt dich dabei durch:

- **Lokale Speicherung** — keine Auftragsverarbeitungsvereinbarung mit einem Cloud-Anbieter nötig
- **Verschlüsselte Backups** (AES-256-GCM + Argon2id) — siehe `src-tauri/src/crypto.rs`
- **Granulares Restore** und **Sandbox-Modus** zum Testen ohne Risiko für die Echtdaten
- **Vollständiger Daten-Export** über DATEV-CSV und Backup-ZIP

## Cookies, Tracking, Werbung

Keine. Kein einziger.

## Kontakt

Fragen zum Datenschutz: Issue im [GitHub-Repo](https://github.com/jonax1337/zettel/issues) öffnen.
Security-relevante Themen: siehe [`SECURITY.md`](./SECURITY.md)
