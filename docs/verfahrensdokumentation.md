# Verfahrensdokumentation nach GoBD (Vorlage für Zettel)

> **Hinweise zur Vorlage**
> - Alles in `[eckigen Klammern]` ist von dir auszufüllen oder anzupassen, nicht zutreffende Abschnitte streichen.
> - Zettel ist **nicht GoBD-zertifiziert**. Es gibt keine offizielle Zertifizierung von Buchhaltungssoftware durch die Finanzverwaltung. Zettel bietet technische Unterstützung (Änderungsprotokoll, Rechnungssiegel, Integritätsprüfung); die Ordnungsmäßigkeit hängt davon ab, wie du die Software einsetzt und organisierst.
> - Diese Vorlage ist **keine Rechts- oder Steuerberatung**. Lass sie im Zweifel von deiner Steuerberatung prüfen.

## 1. Allgemeine Beschreibung

| | |
|---|---|
| Unternehmen / Inhaber | [Name, Rechtsform] |
| Anschrift | [Straße, PLZ Ort] |
| Steuernummer / USt-IdNr. | [Nummer] |
| Besteuerung | [Kleinunternehmer (§ 19 UStG) / Regelbesteuerung, Soll- oder Istversteuerung] |
| Gewinnermittlung | [EÜR / Bilanzierung] |
| Tätigkeit | [kurze Beschreibung der Leistungen] |
| Verantwortlich für die Dokumentation | [Name] |
| Gültig ab | [Datum] |

**Eingesetzte Software**

| Software | Zweck | Version | Einsatz seit |
|---|---|---|---|
| Zettel | Angebote, Rechnungen, Mahnungen, Eingangsrechnungen, Auswertungen | [Versionsnummer, z. B. 0.24.0] | [Datum] |
| [Bank-Software / Online-Banking] | Zahlungseingänge, Kontoauszüge | [–] | [Datum] |
| [Steuerberater-Schnittstelle, z. B. DATEV] | Übergabe der Buchungsdaten | [–] | [Datum] |

Bei jedem Versionswechsel von Zettel die Tabelle und die Änderungshistorie (Abschnitt 6) ergänzen.

## 2. Anwenderdokumentation

### 2.1 Belegfluss Ausgangsrechnungen

1. **Angebot** (`AN-JJJJ-NNNN`): wird als PDF/A-3 erzeugt. Angebote können in eine Rechnung umgewandelt werden.
2. **Rechnung als Entwurf**: Positionen, Kunde und Konditionen erfassen. Ein Entwurf trägt nur einen Platzhalter (`Entwurf #xxxx`) und noch keine Rechnungsnummer. Entwürfe dürfen frei geändert und gelöscht werden.
3. **Rechnung ausstellen** (Versand oder PDF-Erzeugung): Erst jetzt wird die fortlaufende Rechnungsnummer (`RE-JJJJ-NNNN`) vergeben, das PDF erzeugt und die Rechnung **versiegelt** (siehe 3.5). Ab hier ist sie nicht mehr änderbar.
4. **Versand**: [per E-Mail aus dem Mailprogramm / per Post / Download aus Zettel]. Der Versandzeitpunkt wird in Zettel festgehalten.
5. **Zahlung**: Zahlungseingänge werden je Rechnung erfasst (Datum, Betrag). Teilzahlungen sind möglich; die Rechnung gilt erst bei vollständiger Zahlung als bezahlt.
6. **Mahnung** (`MA-JJJJ-NNNN`): bei Zahlungsverzug erzeugt Zettel eine Mahnung als PDF zur Rechnung.
7. **Korrektur / Storno**: Fehler in einer ausgestellten Rechnung werden nicht durch Ändern, sondern durch eine **Stornorechnung** (Gutschrift mit Bezug auf die Originalrechnung) und eine neue Rechnung korrigiert. [Ergänzen: eigener Ablauf bei Stornos, z. B. Rücksprache mit dem Kunden.]

Rechnungsformat: [PDF/A-3 mit eingebettetem ZUGFeRD/Factur-X-XML / XRechnung (CII-XML) für Behörden mit Leitweg-ID].

### 2.2 Eingangsrechnungen und Ausgaben

- Eingangsrechnungen werden als Ausgabe erfasst (Lieferant, Datum, Beträge, Positionen) und das Original-PDF importiert. Zettel legt es unter `Eingangsrechnungen/<Lieferant>/` ab.
- ZUGFeRD-/Factur-X-Rechnungen werden beim Import ausgelesen; bei reinen PDFs werden Datum, Betrag und Rechnungsnummer als Vorschlag erkannt und von dir geprüft.
- Das Originalbeleg-PDF ist maßgeblich, nicht die erfassten Felder.
- Prüfung und Freigabe: [wer, wann, z. B. wöchentlich].

### 2.3 Bankimport und Zahlungsabgleich

- [Beschreibe, ob und wie Kontoauszüge importiert oder Zahlungen von Hand zugeordnet werden, z. B. CSV-Export des Online-Banking, Abgleich einmal wöchentlich.]
- Jede Zuordnung einer Zahlung zu einer Rechnung erscheint im Änderungsprotokoll (3.4).
- Nicht zuordenbare Zahlungen: [Vorgehen].

### 2.4 Auswertungen und Übergabe an die Steuerberatung

- Umsatzsteuer-Voranmeldung, Einnahmen-/Ausgabenübersicht, DATEV-Export (Format 700): [Zeitpunkt, Empfänger, Übertragungsweg].
- Die elektronische Übermittlung an das Finanzamt (ELSTER) erfolgt **außerhalb** von Zettel.

## 3. Technische Systemdokumentation

### 3.1 Systemüberblick

- Zettel ist eine **lokale Desktop-Anwendung** (Windows / macOS / Linux). Es gibt keinen Server und keine Cloud; die Daten verlassen den Rechner nur durch Aktionen, die du auslöst (E-Mail-Versand, Backup in einen Cloud-Ordner, Export).
- Daten liegen in einer **SQLite-Datenbank** im Anwendungsdatenordner (Windows: `%APPDATA%\digital.laux.zettel\`, macOS: `~/Library/Application Support/digital.laux.zettel/`, Linux: `~/.local/share/digital.laux.zettel/`).
- Belege (PDF) liegen im Dokumentenordner `<Dokumente-Root>/{Rechnungen,Angebote,Mahnungen,Eingangsrechnungen,Backups}/`. Der Root ist `<Dokumente>/Zettel` (Standard), `<Dokumente>/Zettel-Sandbox` (Sandbox) bzw. `<Dokumente>/Zettel/Mandanten/<Mandanten-ID>` (eigener Mandant); `<Dokumente>` ist der Ordner „Dokumente“ des Betriebssystems (unter Windows folgt er einer Umleitung nach OneDrive). [Tatsächlicher Pfad auf dem eingesetzten Rechner: ___]
- Eingesetzter Rechner: [Gerät, Betriebssystem, Speicherort der Daten, Festplattenverschlüsselung ja/nein].

### 3.2 Belegformate

- Ausgangsrechnungen: PDF/A-3 mit eingebettetem maschinenlesbarem XML (ZUGFeRD/Factur-X, Profil EN 16931) oder XRechnung 3.0 (CII). Das PDF ist das archivierte Original.
- Beträge werden als ganze Cent gespeichert (keine Rundungsfehler durch Fließkommazahlen).
- Die Rechnungsnummern sind fortlaufend und lückenlos; Entwürfe verbrauchen keine Nummer.
- Zettel kann erzeugte E-Rechnungen mit dem KoSIT-Validator prüfen (Sidebar „E-Rechnung validieren“ bzw. „Validieren“ im Rechnungsdetail).

### 3.3 Unveränderbarkeit ausgestellter Rechnungen

- Nur **Entwürfe** sind änderbar. Eine ausgestellte Rechnung (versendet, teilweise bezahlt, bezahlt) kann in der Oberfläche nicht bearbeitet werden.
- Korrekturen erfolgen per Stornorechnung und neuer Rechnung (2.1).
- Stellt man eine ausgestellte Rechnung bewusst wieder auf Entwurf zurück, wird das als eigenes Siegel („reopen“) festgehalten und ist nachvollziehbar.
- Die PDF-Dateien werden bei einer Neuerzeugung versioniert und nicht überschrieben.

### 3.4 Änderungsprotokoll (Audit-Log)

- Datenbank-Trigger schreiben jede Änderung (Anlegen, Ändern, Löschen) an Rechnungen, Positionen, Zahlungen, Mahnungen, Ausgaben, Kunden, Lieferanten und Einstellungen in die Tabelle `audit_log`: Zeitpunkt, Tabelle, Datensatz, Aktion, alte und neue Werte.
- Das Protokoll wird **in der Datenbank** geführt und ist damit auch bei Änderungen über die Kommandozeile (`cli/zettel.py`) vollständig.
- Die Tabelle ist **append-only**: Datenbank-Trigger verhindern das Ändern und Löschen von Protokollzeilen.
- Daten löschen („Gefahrenbereich“) entfernt das Protokoll nicht; gelöschte ausgestellte Rechnungen bleiben darin sichtbar.
- Eine Teil-Wiederherstellung aus einem Backup (4.3) wird als ein Eintrag `restore` protokolliert.

### 3.5 Rechnungssiegel und Hash-Kette

- Beim Ausstellen einer Rechnung berechnet Zettel einen SHA-256-Hash über den Inhalt (Rechnungskopf und Positionen) und hängt ihn als **Siegel** an eine Kette (`invoice_seals`). Jedes Siegel enthält zusätzlich den Hash seines Vorgängers; eine nachträglich geänderte, entfernte oder eingefügte Zeile bricht die Kette.
- Nicht versiegelt sind Felder, die sich legitim nach dem Ausstellen ändern (Status, Versand-/Zahlungsdatum, bezahlter Betrag, interne Notizen, PDF-Pfad).
- Rechnungen, die aus einer älteren Programmversion stammen, werden beim Programmstart nachträglich versiegelt. Der Nachweis beginnt für diese Rechnungen dann erst zu diesem Zeitpunkt.
- Die Hash-Kette schützt vor unbemerkter Manipulation, ist aber **keine qualifizierte Signatur** und kein Zeitstempel einer dritten Stelle. Wer Zugriff auf den Rechner hat, kann die gesamte Datenbank ersetzen; dagegen helfen nur Zugriffsschutz (5.2) und Backups an getrennten Orten (4.1).

### 3.6 Integritätsprüfung

- Einstellungen → Daten → Integritätsprüfung prüft die Siegelkette (Verkettung, Hashes) und vergleicht jede ausgestellte Rechnung mit ihrem Siegel.
- Gemeldet werden u. a.: unterbrochene Kette, manipuliertes Siegel, geänderter Rechnungsinhalt, gelöschte Rechnung, nicht versiegelte Rechnung (Warnung).
- Jede Meldung ist zu klären und das Ergebnis zu dokumentieren (5.1).

### 3.7 Schnittstellen und Exporte

- Export: DATEV-Buchungsstapel (CSV), UStVA- und Anlage-EÜR-Auswertung (CSV), Änderungsprotokoll (CSV), XRechnung-XML, Backup-ZIP.
- Versand per E-Mail: Zettel übergibt PDF und Empfänger an das lokale Mail-Programm (kein SMTP, keine Kopie der Nachricht in Zettel). Die versendete E-Mail archivierst du im Mail-Programm (Aufbewahrung siehe 4.2).
- Maschinelle Auswertbarkeit für Betriebsprüfungen (Datenzugriff Z1–Z3): [Vorgehen, z. B. Export als CSV/DATEV und Herausgabe der PDF-Belege auf Datenträger].

## 4. Betriebsdokumentation

### 4.1 Datensicherung

- Zettel erstellt auf Wunsch ein **Backup** (ZIP mit Datenbank-Snapshot, allen Beleg-PDFs und Manifest). [Automatisch alle ___ Tage / manuell jeweils ___.]
- Backups können mit einem Passwort **verschlüsselt** werden (AES-256-GCM, Schlüsselableitung Argon2id). Es wird kein Passwort gespeichert; **ohne Passwort ist ein verschlüsseltes Backup unbrauchbar**. Passwort ablegen: [Passwortmanager / Tresor].
- Speicherorte: lokal `<Dokumente-Root>/Backups/` (siehe 3.1) und zusätzlich [externe Festplatte / verschlüsselter Cloud-Ordner / NAS]. Mindestens eine Kopie liegt außerhalb des Rechners.
- Prüfung: [vierteljährlich] ein Backup testweise wiederherstellen (am besten im Sandbox-Modus von Zettel) und die Integritätsprüfung durchführen.

### 4.2 Aufbewahrung

*Keine Rechtsberatung — Fristen im Einzelfall mit Steuerberater abstimmen.*

| Unterlagen | Frist |
|---|---|
| Buchungsbelege, z. B. Ausgangs- und Eingangsrechnungen | 8 Jahre¹ |
| Bücher, Aufzeichnungen, Jahresabschlüsse, Inventare, Verfahrensdokumentation | 10 Jahre |
| Empfangene und abgesandte Handels- und Geschäftsbriefe (z. B. Angebote, Mahnungen, versendete E-Mails) | 6 Jahre |

¹ § 147 Abs. 3 AO in der Fassung des Bürokratieentlastungsgesetzes IV; gilt für Unterlagen, deren Aufbewahrungsfrist am 1.1.2025 noch nicht abgelaufen war.

- Die Frist beginnt mit Ende des Kalenderjahres, in dem der Beleg entstanden ist.
- Die Verfahrensdokumentation wird so lange aufbewahrt wie die Unterlagen, auf die sie sich bezieht, auch in älteren Fassungen.
- Während der Frist werden Daten und Belege **nicht gelöscht**. Die Funktion „Daten löschen“ in Zettel wird für Echtdaten nicht benutzt.
- Lesbarkeit: Backups und PDF/A-Belege werden [jährlich] auf Lesbarkeit geprüft. Bei einem Datenträger- oder Systemwechsel werden Daten vollständig migriert.

### 4.3 Wiederherstellung

- **Vollständige Wiederherstellung**: ersetzt die gesamte Datenbank samt Änderungsprotokoll und Siegelkette durch den Stand des Backups und wird beim nächsten Programmstart angewendet. Alles, was nach dem Backup entstanden ist, geht verloren; Zettel legt vorher ein Sicherheits-Backup an.
- **Teil-Wiederherstellung** (Kunden, Rechnungen, Einstellungen einzeln): ersetzt nur die gewählten Bereiche.
  - Das Änderungsprotokoll bleibt erhalten; es erhält genau einen Eintrag `restore` mit den wiederhergestellten Bereichen. Die einzelnen ersetzten Zeilen werden nicht protokolliert.
  - Wird der Bereich Rechnungen wiederhergestellt, werden auch die Siegel aus dem Backup übernommen. Enthält das Backup noch keine Siegel (ältere Version), werden die Rechnungen beim nächsten Start neu versiegelt; danach die Integritätsprüfung ausführen.
  - Rechnungsnummernzähler werden nie zurückgesetzt, damit keine Nummer doppelt vergeben wird.
- Jede Wiederherstellung wird hier festgehalten: [Datum, Grund, Backup-Datei, durchgeführt von, Ergebnis der Integritätsprüfung].

### 4.4 Programmaktualisierungen

- Zettel prüft auf Updates (signiert) und installiert sie nach Bestätigung. [Update-Kanal stabil / Beta.]
- Vor einem Update: aktuelles Backup erstellen. Nach einem Update: Version in Abschnitt 1 eintragen und die Integritätsprüfung ausführen.
- Datenbank-Migrationen laufen automatisch beim Start. Wirkung auf die Dokumentation: siehe CHANGELOG.md.

## 5. Internes Kontrollsystem (IKS)

### 5.1 Regelmäßige Kontrollen

| Kontrolle | Rhythmus | Verantwortlich | Nachweis |
|---|---|---|---|
| Integritätsprüfung durchführen, Meldungen klären | [monatlich und vor jeder Übergabe an die Steuerberatung] | [Name] | [Notiz/Ablage] |
| Lückenlose Rechnungsnummern prüfen (Rechnungsliste) | [vierteljährlich] | [Name] | [Notiz/Ablage] |
| Offene Posten und Zahlungseingänge abgleichen | [wöchentlich] | [Name] | [Notiz/Ablage] |
| Backup erstellt und extern abgelegt | [wöchentlich] | [Name] | [Backup-Dateiname/Datum] |
| Wiederherstellungstest | [vierteljährlich] | [Name] | [Protokoll] |
| Erfassung der Eingangsrechnungen vollständig | [monatlich] | [Name] | [Notiz/Ablage] |

Auffälligkeiten (z. B. Meldung der Integritätsprüfung) werden mit Datum, Ursache und Maßnahme hier oder in [Ablageort] festgehalten.

### 5.2 Zugriffsschutz

- Der Rechner ist durch [Anmeldepasswort / PIN / Biometrie] geschützt, die Bildschirmsperre aktiviert sich nach [Minuten]. Die Festplatte ist [verschlüsselt: BitLocker / FileVault / LUKS].
- Zettel selbst kennt keine Benutzerverwaltung; der Zugriff auf die Daten entspricht dem Zugriff auf das Benutzerkonto des Betriebssystems. [Nur der Inhaber nutzt das Konto / weitere Personen: ___ mit eigenem Konto.]
- Betriebssystem und Virenschutz werden aktuell gehalten: [Verfahren].
- Backup-Passwörter und Zugänge werden getrennt vom Rechner aufbewahrt.

### 5.3 Mandanten und Sandbox

- Zettel kann mehrere Mandanten (eigene Datenbank und Ablage) verwalten. Eingesetzte Mandanten: [Liste].
- Der **Sandbox-Modus** arbeitet mit einer getrennten Testdatenbank. Echte Belege entstehen ausschließlich im Echtbetrieb; das Banner „Sandbox“ ist zu beachten.

## 6. Änderungshistorie der Dokumentation

| Datum | Version der Dokumentation | Änderung | Zettel-Version | Bearbeiter |
|---|---|---|---|---|
| [Datum] | 1.0 | Erstfassung | [Version] | [Name] |
| [Datum] | [1.1] | [z. B. neues Backup-Ziel] | [Version] | [Name] |

Frühere Fassungen werden aufbewahrt: [Ablageort].
