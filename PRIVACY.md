# Datenschutz / Privacy

**Kurz-Fassung:** Zettel ist eine lokale Desktop-Anwendung. Sie sendet keine Telemetrie, kein Tracking, keine Analytics. Es gibt keinen Server, der Daten empfangen könnte.

## Daten, die Zettel verarbeitet

Alle Daten bleiben auf deinem Gerät. Die Anwendung legt Dateien an folgenden Stellen ab:

| Plattform | App-Daten |
|---|---|
| Windows | `%APPDATA%\digital.laux.zettel\` |
| macOS | `~/Library/Application Support/digital.laux.zettel/` |
| Linux | `~/.config/digital.laux.zettel/` (Datenbanken), `~/.local/share/digital.laux.zettel/` (`sandbox.flag`, `tenants.json`, `pending_restore/`) |

Die **generierten PDFs und Backups** liegen unter einem Dokumente-Root im Ordner „Dokumente“ des Betriebssystems (unter Windows der bekannte Ordner „Dokumente“, er folgt also einer Umleitung nach OneDrive):

- Standard: `<Dokumente>/Zettel`
- Sandbox: `<Dokumente>/Zettel-Sandbox`
- Eigener Mandant: `<Dokumente>/Zettel/Mandanten/<Mandanten-ID>`

Darunter liegen `Rechnungen/`, `Angebote/`, `Mahnungen/`, `Eingangsrechnungen/<Lieferant>/` (eingelesene Lieferanten-PDFs) und `Backups/`.

Im App-Daten-Verzeichnis liegen:

- `zettel.db` — die SQLite-Datenbank mit Kunden, Lieferanten, Rechnungen, Angeboten, Ausgaben, Projekten und Zeiteinträgen, Einstellungen (inkl. Bankverbindung und Mail-Vorlagen), Änderungsprotokoll und Rechnungssiegeln
- `zettel-sandbox.db` — separate DB für den Sandbox-Modus (nur wenn aktiviert)
- `sandbox.flag` — Marker-Datei für den aktiven Modus
- `tenants.json` — Liste deiner Mandanten (Name und Pfad der jeweiligen Datenbank) und der aktive Mandant
- `pending_restore/` — temporärer Ordner während eines Restore-Vorgangs (wird nach Anwendung gelöscht)

Eigene Mandanten-Datenbanken können an einem von dir gewählten Ort liegen (z. B. in einem Cloud-Ordner); Zettel legt sie dann dort ab.

**Nichts davon wird von Zettel hochgeladen, gesynct oder geteilt.** Liegt ein Ordner in einem Cloud-Dienst, den du selbst eingerichtet hast (z. B. OneDrive), synchronisiert dieser Dienst ihn.

### Änderungsprotokoll und Rechnungssiegel

Für die GoBD-Nachvollziehbarkeit protokolliert Zettel Änderungen in der Datenbank:

- **Änderungsprotokoll (`audit_log`):** Jede Änderung an Rechnungen, Positionen, Zahlungen, Mahnungen, Ausgaben, Kunden, Lieferanten und Einstellungen wird mit Zeitpunkt sowie **alten und neuen Werten** gespeichert. Dazu gehören auch personenbezogene Daten deiner Kunden und Lieferanten (z. B. Name, Anschrift, E-Mail) und deine Bankverbindung.
- **Rechnungssiegel (`invoice_seals`):** SHA-256-Hashes und Zeitpunkte zu ausgestellten Rechnungen.
- Beide Tabellen sind **append-only**: Datenbank-Trigger verhindern das Ändern und Löschen einzelner Zeilen.

## Änderungsprotokoll und Löschung

Das Änderungsprotokoll überlebt die Funktion „Daten löschen“ (Einstellungen → Erweitert → Gefahrenbereich); auch ein gelöschter Kunde bleibt dort mit seinen früheren Werten sichtbar. Aus der App heraus lässt sich das Protokoll nicht bearbeiten. Es verschwindet nur, wenn die Datenbank-Datei selbst gelöscht oder durch eine Vollwiederherstellung ersetzt wird.

Für einen Löschwunsch nach Art. 17 DSGVO bedeutet das: Er kann mit gesetzlichen Aufbewahrungspflichten zusammentreffen (Art. 17 Abs. 3 lit. b DSGVO nimmt Verarbeitungen, die zur Erfüllung einer rechtlichen Verpflichtung erforderlich sind, von der Löschpflicht aus; Fristen siehe [`COMPLIANCE.md`](./COMPLIANCE.md)). Wie du im Einzelfall vorgehst, klärst du mit deinem Steuerberater oder deiner Datenschutzberatung — **keine Rechtsberatung**.

## Browser-/WebView-State

Zettel rendert seine UI in einem System-WebView (WebView2 auf Windows, WKWebView auf macOS, WebKitGTK auf Linux). Der WebView speichert intern:

- `localStorage` — UI-Präferenzen und Merker, keine Rechnungs- oder Kundendaten: Theme (`zettel.theme`), Listenfilter, Standard-Zeitraum des Dashboards, Update-Kanal (`zettel.update_channel`), „Onboarding nicht mehr anzeigen“ pro Datenbank, zuletzt verwendete Suchbegriffe der globalen Suche (`zettel.search.recents`), die zuletzt eingegebene Berater-/Mandantennummer und Stapelbezeichnung des DATEV-Exports (`zettel.datev-export`) und ein Merker zum letzten fehlgeschlagenen Auto-Backup
- Caches für Schriftarten und gebundelte Assets

Alles davon liegt im App-Daten-Verzeichnis und verlässt das Gerät nicht.

## Ausgehende Netzwerkverbindungen

Zettel hat exakt zwei Code-Pfade, die das Internet kontaktieren — beide mit klar definierten Endpunkten:

1. **GitHub Updater** (`@tauri-apps/plugin-updater`, Kanal-Logik in `src-tauri/src/updates.rs`)
   - Endpunkt stabiler Kanal: `https://github.com/jonax1337/zettel/releases/latest/download/latest.json`; Endpunkt Beta-Kanal: `https://github.com/jonax1337/zettel/releases/download/beta-feed/latest.json`; bei verfügbarem Update zusätzlich der Download von Installer-Binary und Ed25519-Signatur
   - Inhalt: ein HTTPS-Abruf einer statischen Datei; der Versionsvergleich passiert lokal in der App. Wie bei jedem Abruf sieht GitHub technisch bedingt deine IP-Adresse
   - Frequenz: automatisch kurz (etwa 10 Sekunden) nach dem App-Start und manuell über „Nach Updates suchen“ in den Einstellungen
   - Die Wahl **stabil/beta** triffst du in den Einstellungen („Beta-Updates“); sie wird im `localStorage` unter `zettel.update_channel` gespeichert
   - **Nicht abschaltbar:** Es gibt keinen Schalter, der die Prüfung deaktiviert. Offline schlägt sie still fehl; wer keine Prüfung will, betreibt die App offline bzw. sperrt den Zugriff auf GitHub in seiner Firewall

2. **EZB-Wechselkurs** (`src-tauri/src/exchange.rs`)
   - Endpunkt: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`
   - Inhalt: GET-Request ohne Parameter, keine Identifikation
   - Frequenz: **nur on-demand**, wenn du eine Rechnung in einer Fremdwährung erstellst und auf „Kurs aktualisieren" klickst
   - **Abschaltbar:** einfach den Kurs manuell eintippen

Es gibt **keine** weiteren ausgehenden Verbindungen. Insbesondere:

- ❌ Kein Analytics (Google Analytics, Plausible, Matomo, Mixpanel, etc.)
- ❌ Kein Error-Reporting (Sentry, Bugsnag, Rollbar, etc.)
- ❌ Kein Telemetrie-Ping
- ❌ Keine Font-CDNs (die Schriften Nunito und Nunito Sans sind lokal gebundelt)
- ❌ Keine Auth-Provider, keine Cloud-Sync, keine Backups in fremde Clouds

Das kannst du selbst verifizieren — z.B. mit Wireshark/Little Snitch/`tcpdump` oder schlicht offline arbeiten.

### Mail-Übergabe

„Per E-Mail senden“ (Rechnungen, Angebote, Mahnungen) baut **keine** Verbindung auf: Zettel übergibt Empfänger, Betreff, Text und PDF an dein lokales Mail-Programm (Windows: Simple MAPI, macOS: Mail.app, Linux: `xdg-email`; Fallback: `mailto:`-Link plus Anzeige des PDF-Ordners). Versendet wird dort, mit den Servern und Einstellungen deines Mail-Programms. Zettel hat keine SMTP-Anbindung, speichert keine Zugangsdaten und keine Kopie der gesendeten Nachricht. In der Datenbank liegen nur die **Mail-Vorlagen** (Betreff und Text je Dokumenttyp) in den Einstellungen.

## DSGVO / GDPR

Da Zettel keine personenbezogenen Daten an einen Verantwortlichen außerhalb deines Geräts überträgt, ist Zettel selbst kein „Verarbeiter" im Sinne der DSGVO.

**Du als Nutzer bist Verantwortlicher** für die Daten deiner Kunden und Lieferanten, die du in Zettel speicherst. Das umfasst u.a.:

- Erfüllung von Auskunfts-, Berichtigungs- und Löschungs-Pflichten (Art. 15–17 DSGVO) gegenüber deinen Kunden — beachte dabei den Abschnitt „Änderungsprotokoll und Löschung“
- Technisch-organisatorische Maßnahmen (Art. 32 DSGVO) — Geräteverschlüsselung, Backups, Zugriffsschutz auf deinen Rechner
- Aufbewahrungsfristen nach § 147 AO (siehe [`COMPLIANCE.md`](./COMPLIANCE.md))

Zettel unterstützt dich dabei durch:

- **Lokale Speicherung** — keine Auftragsverarbeitungsvereinbarung mit einem Cloud-Anbieter nötig
- **Verschlüsselte Backups** (AES-256-GCM + Argon2id) — siehe `src-tauri/src/crypto.rs`
- **Granulares Restore** und **Sandbox-Modus** zum Testen ohne Risiko für die Echtdaten
- **Datenexport** über Backup-ZIP, DATEV-CSV, UStVA- und Anlage-EÜR-CSV, das Änderungsprotokoll als CSV und die XRechnung-XML

## Cookies, Tracking, Werbung

Keine. Kein einziger.

## Kontakt

Fragen zum Datenschutz: Issue im [GitHub-Repo](https://github.com/jonax1337/zettel/issues) öffnen.
Security-relevante Themen: siehe [`SECURITY.md`](./SECURITY.md)
