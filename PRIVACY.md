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
- `zettel.db.bak` (bzw. `<name>.db.bak` bei Mandanten-Datenbanken) — nach einer Vollwiederherstellung die vorherige Datenbank samt WAL-Dateien, im selben Ordner wie die Datenbank. Zettel überschreibt sie erst bei der nächsten Vollwiederherstellung und löscht sie sonst nicht

Eigene Mandanten-Datenbanken können an einem von dir gewählten Ort liegen (z. B. in einem Cloud-Ordner); Zettel legt sie dann dort ab.

**Nichts davon wird von Zettel hochgeladen, gesynct oder geteilt.** Liegt ein Ordner in einem Cloud-Dienst, den du selbst eingerichtet hast (z. B. OneDrive), synchronisiert dieser Dienst ihn.

### Änderungsprotokoll und Rechnungssiegel

Für die GoBD-Nachvollziehbarkeit protokolliert Zettel Änderungen in der Datenbank:

- **Änderungsprotokoll (`audit_log`):** Jede Änderung an Rechnungen, Positionen, Zahlungen, Mahnungen, Ausgaben, Kunden, Lieferanten und Einstellungen wird mit Zeitpunkt sowie **alten und neuen Werten** gespeichert. Dazu gehören auch personenbezogene Daten deiner Kunden und Lieferanten (z. B. Name, Anschrift, E-Mail) und deine Bankverbindung.
- **Rechnungssiegel (`invoice_seals`):** SHA-256-Hashes und Zeitpunkte zu ausgestellten Rechnungen.
- Beide Tabellen sind **append-only**: Datenbank-Trigger verhindern das Ändern und Löschen einzelner Zeilen. Das schützt vor Versehen und macht Änderungen sichtbar, die an der Hash-Kette vorbei erfolgen, ist aber kein kryptografischer Schutz (kein geheimer Schlüssel, kein externer Anker): Wer die Datenbank mit einem SQLite-Werkzeug bearbeitet, kann die Trigger entfernen und die Kette neu berechnen. Dagegen helfen Zugriffsschutz auf deinen Rechner und Backups an getrennten Orten.
- **Ausnahme:** Eine Teil-Wiederherstellung des Bereichs Rechnungen entfernt die Trigger kurzzeitig, ersetzt `invoice_seals` durch die Siegel des Backups (Siegel, die nach dem Backup entstanden sind, gehen verloren) und stellt die Trigger wieder her. Das Änderungsprotokoll bleibt erhalten und erhält dafür einen Eintrag `restore`.

## Änderungsprotokoll und Löschung

Das Änderungsprotokoll überlebt die Funktion „Daten löschen“ (Einstellungen → Erweitert → Gefahrenbereich); auch ein gelöschter Kunde bleibt dort mit seinen früheren Werten sichtbar. Aus der App heraus lässt sich das Protokoll nicht bearbeiten, und auch nach Ablauf der Aufbewahrungsfristen lassen sich einzelne Einträge nicht selektiv bereinigen. Es verschwindet nur, wenn die Datenbank-Datei selbst gelöscht oder durch eine Vollwiederherstellung ersetzt wird.

„Daten löschen“ entfernt außerdem nur Datensätze in der Datenbank. Nicht berührt werden:

- die erzeugten PDFs (`Rechnungen/`, `Angebote/`, `Mahnungen/`, `Eingangsrechnungen/`) und alle Backups in `Backups/`
- das **unverschlüsselte** Sicherheits-Backup `pre-wipe-…zip`, das Zettel vor dem Löschen in den Backup-Ordner schreibt; es enthält die Daten von vor dem Löschen im Klartext
- die vorherige Datenbank `zettel.db.bak` nach einer Vollwiederherstellung

Diese Dateien löschst du bei einem Löschwunsch selbst (auch in Cloud-Ordnern, Papierkorb und externen Backups).

### Löschung (Art. 17) und Einschränkung (Art. 18)

Ein Löschwunsch nach Art. 17 DSGVO kann mit gesetzlichen Aufbewahrungspflichten zusammentreffen (Art. 17 Abs. 3 lit. b DSGVO nimmt Verarbeitungen, die zur Erfüllung einer rechtlichen Verpflichtung erforderlich sind, von der Löschpflicht aus; Fristen siehe [`COMPLIANCE.md`](./COMPLIANCE.md)). Dabei gilt:

- Die Ausnahme trifft nur Daten, die tatsächlich einer Aufbewahrungspflicht unterliegen (z. B. Rechnungen, Belege, Buchführungsunterlagen), und nur bis zum Ablauf der Frist. Daten ohne Aufbewahrungspflicht (z. B. ein Kontakt ohne Beleg, interne Notizen) fallen nicht unter Art. 17 Abs. 3 lit. b und sind auf Wunsch zu löschen.
- Während der Aufbewahrungsfrist kommt statt der Löschung eine **Einschränkung der Verarbeitung** (Art. 18 DSGVO) in Betracht: Die Daten werden nur noch aufbewahrt, nicht mehr genutzt. Eine technische Sperrfunktion bietet Zettel dafür nicht; du setzt sie organisatorisch um (nicht mehr verwenden, Zugriff beschränken).
- Nach Ablauf der Fristen ist ein Löschwunsch zu erfüllen. Weil sich das Änderungsprotokoll nicht selektiv bereinigen lässt (s. o.), bleibt dafür nur, die Datenbank neu anzulegen und die Daten zu übernehmen, die weiter benötigt werden.

Wie du im Einzelfall vorgehst, klärst du mit deinem Steuerberater oder deiner Datenschutzberatung — **keine Rechtsberatung**.

## Browser-/WebView-State

Zettel rendert seine UI in einem System-WebView (WebView2 auf Windows, WKWebView auf macOS, WebKitGTK auf Linux). Der WebView speichert intern:

- `localStorage` — UI-Präferenzen und Merker: Theme (`zettel.theme`), Sortierung der Listen (`zettel.sort.*`), Standard-Zeitraum des Dashboards, Update-Kanal (`zettel.update_channel`), „Onboarding nicht mehr anzeigen“ pro Datenbank, die zuletzt eingegebene Berater-/Mandantennummer und Stapelbezeichnung des DATEV-Exports (`zettel.datev-export`) und ein Merker zum letzten fehlgeschlagenen Auto-Backup. Dazu kommt die Liste „Zuletzt geöffnet“ der globalen Suche (`zettel.search.recents`, bis zu 5 Treffer): Sie speichert Belegnummer und Anzeigetexte (z. B. Kunden- oder Lieferantenname) der zuletzt geöffneten Treffer, also **personenbezogene Daten**.
- `sessionStorage` — die Listenfilter (`zettel.filters.*`); sie enden mit dem Schließen der App
- Caches für Schriftarten und gebundelte Assets

„Daten löschen“ räumt diese WebView-Daten nicht auf: Die „Zuletzt geöffnet“-Liste kann einen gelöschten Kunden weiter nennen, bis sie durch neue Treffer verdrängt wird. Eine eigene Löschfunktion dafür gibt es in Zettel nicht; die Daten liegen im WebView-Profil deines Benutzerkontos und verlassen das Gerät nicht.

## Ausgehende Netzwerkverbindungen

Zettel hat exakt zwei Code-Pfade, die das Internet kontaktieren — beide mit klar definierten Endpunkten:

1. **GitHub Updater** (`@tauri-apps/plugin-updater`, Kanal-Logik in `src-tauri/src/updates.rs`)
   - Endpunkt stabiler Kanal: `https://github.com/jonax1337/zettel/releases/latest/download/latest.json`; Endpunkt Beta-Kanal: `https://github.com/jonax1337/zettel/releases/download/beta-feed/latest.json`; die Ed25519-Signatur steht in der `latest.json`. Der Installer wird erst heruntergeladen, wenn du bei der Update-Meldung auf „Installieren“ klickst (GitHub leitet den Download auf `*.githubusercontent.com` um)
   - Inhalt: ein HTTPS-Abruf einer statischen Datei; der Versionsvergleich passiert lokal in der App. Wie bei jedem Abruf sieht GitHub technisch bedingt deine IP-Adresse
   - Frequenz: automatisch kurz (etwa 10 Sekunden) nach dem App-Start und manuell über „Nach Updates suchen“ in den Einstellungen
   - Die Wahl **stabil/beta** triffst du in den Einstellungen („Beta-Updates“); sie wird im `localStorage` unter `zettel.update_channel` gespeichert
   - **Nicht abschaltbar:** Es gibt keinen Schalter, der die Prüfung deaktiviert. Offline schlägt sie still fehl; wer keine Prüfung will, betreibt die App offline bzw. sperrt den Zugriff auf GitHub (`github.com` und `*.githubusercontent.com`) in seiner Firewall

2. **EZB-Wechselkurs** (`src-tauri/src/exchange.rs`)
   - Endpunkt: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`
   - Inhalt: GET-Request ohne Parameter, keine Identifikation
   - Frequenz: **nur on-demand**, wenn du eine Rechnung in einer Fremdwährung erstellst und auf „EZB-Kurs" klickst
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

Da Zettel keine personenbezogenen Daten an einen Verantwortlichen außerhalb deines Geräts überträgt, ist Zettel selbst kein „Auftragsverarbeiter" im Sinne der DSGVO (Art. 28).

**Du als Nutzer bist Verantwortlicher** für die Daten deiner Kunden und Lieferanten, die du in Zettel speicherst. Das umfasst u.a.:

- Erfüllung von Auskunfts-, Berichtigungs-, Löschungs- und Einschränkungs-Pflichten (Art. 15–18 DSGVO) gegenüber deinen Kunden — beachte dabei den Abschnitt „Änderungsprotokoll und Löschung“
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
