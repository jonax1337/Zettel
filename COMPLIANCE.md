# Compliance & rechtliche Hinweise

Zettel erzeugt elektronische Rechnungen nach **EN 16931** (ZUGFeRD/Factur-X, XRechnung) und bereitet Daten für die deutsche Buchführung vor. Damit ist Zettel ein **Hilfsmittel**, keine vollständige Buchhaltungssoftware — und ersetzt erst recht keinen Steuerberater.

Dieses Dokument beschreibt, was Zettel kann, was bewusst nicht abgedeckt ist, und wo du als Nutzer selbst tätig werden musst.

## Keine Rechts- oder Steuerberatung

Die Inhalte dieser Datei sowie der Anwendung sind eine **technische Beschreibung**, keine Rechtsberatung. Konkrete Fragen zu Aufbewahrung, GoBD-Konformität, E-Rechnungspflicht, Umsatzsteuer-Behandlung oder Bilanzierung bitte mit deinem **Steuerberater** oder einer **Rechtsanwältin** klären. Die ersten Rechnungen vor dem produktiven Versand prüfen lassen. Rechtliche Angaben (Fristen, Stichtage) sind eine allgemeine Orientierung ohne Gewähr.

## EN 16931 / ZUGFeRD / Factur-X

Zettel erzeugt PDF/A-3 mit eingebettetem CII-XML in den Profilen **BASIC**, **EN 16931** (Standard) und **EXTENDED**. Validiert wird gegen den offiziellen [KoSIT-Validator](https://github.com/itplr-kosit/validator) (im Release-Build mitgeliefert).

**Was wir nach bestem Wissen umsetzen:**

- BR-CO-26-konformer `BT-29`-Fallback für Kleinunternehmer ohne USt-IdNr.
- Reverse-Charge intra-EU (`CategoryCode K`) und Drittland (`CategoryCode G`) inkl. Pflicht-Hinweistexte
- Storno als first-class Credit Note (CII `InvoiceReferencedDocument` in `ApplicableHeaderTradeSettlement`)
- Leistungszeiträume auf Header- (BG-14, BT-73/74) und Positions-Ebene (BG-26, BT-134/135)
- Lange Positions-Beschreibungen (BT-154)
- Käuferreferenz / Leitweg-ID (BT-10), wenn sie an der Rechnung gesetzt ist

**Positionsbeträge:** Menge × Einzelpreis wird exakt in Cent berechnet; halbe Cent werden zum höheren Wert gerundet. Jede Position wird einzeln gerundet, die USt ebenfalls je Position. Mengen werden mit höchstens vier Nachkommastellen gespeichert. Ausgestellte Rechnungen, Stornorechnungen dazu und versendete Angebote behalten ihre gespeicherten Beträge auf den Cent, auch wenn sie aus der Zeit vor dieser Rundungsregel stammen.

**Aber:** Validierungs-Profile entwickeln sich weiter. Wir testen gegen den aktuellen KoSIT-Validator zum Zeitpunkt jedes Releases. Wenn dein Empfänger eine spezielle Validierungs-Regel (z.B. ein bestimmtes B2B-Portal) anwendet, kann es Edge-Cases geben. Bug-Reports mit konkretem Validator-Output sind willkommen — siehe Issue-Template „ZUGFeRD validation".

### XRechnung

Rechnungen lassen sich zusätzlich als **XRechnung 3.0 (CII)** exportieren — als eigenständige `.xml` neben dem PDF (Rechnungsdetail → Menü → „XRechnung exportieren", CLI: `invoice:xrechnung`).

- Die **Leitweg-ID** wird am Kunden hinterlegt und beim Anlegen als Käuferreferenz (BT-10) in die Rechnung kopiert; pro Rechnung lässt sie sich überschreiben. Stornorechnungen erben die Referenz der Originalrechnung.
- Vor dem Export prüft Zettel die Pflichtangaben (`src/lib/xrechnung/preflight.ts`): Leitweg-ID, Firmenname und Anschrift des Verkäufers, Ansprechpartner, Telefonnummer und E-Mail-Adresse des Verkäufers, USt-IdNr. oder Steuernummer, IBAN, Anschrift und E-Mail-Adresse des Kunden. Fehlt etwas, zeigt Zettel die Liste statt einer ungültigen Datei.
- Die erzeugte Datei besteht den gebündelten KoSIT-Validator mit dem Szenario „EN16931 XRechnung (CII)". Getestet ist das gegen diesen Validator, **nicht gegen jedes Behörden- oder Einkaufsportal**. Entwürfe lassen sich nicht exportieren; Rechnung erst ausstellen.

### E-Rechnungspflicht (B2B, Deutschland)

*Keine Rechtsberatung — Stichtage und Ausnahmen im Einzelfall mit dem Steuerberater abstimmen.*

- **Empfangen:** Unternehmen müssen E-Rechnungen im B2B-Bereich seit dem **1.1.2025** empfangen können.
- **Ausstellen:** Die Pflicht zum Ausstellen wird schrittweise **ab 2027 bzw. 2028** eingeführt. **Kleinunternehmer** (§ 19 UStG) sind von der Pflicht zum Ausstellen ausgenommen.

Was Zettel dazu bietet:

- **Ausgang:** ZUGFeRD/Factur-X (PDF/A-3 mit eingebettetem XML) in den Profilen EN 16931 und EXTENDED sowie XRechnung (XML). Ob das Profil **BASIC** bei deinem Empfänger als E-Rechnung gilt, klärst du mit dem Steuerberater; im Zweifel das Standardprofil EN 16931 verwenden. MINIMUM und BASIC WL bietet Zettel nicht an.
- **Eingang:** Zettel liest eingehende ZUGFeRD-/Factur-X-PDFs aus (Eingangsrechnungen → Drop-Zone). Reine XML-Dateien (z.B. XRechnung) lassen sich mit „E-Rechnung validieren" prüfen, aber nicht als Eingangsrechnung importieren. PDFs ohne XML liest Zettel nur über eine Text-Heuristik als Vorschlag; Scans werden nicht erkannt.
- **Ablage:** Zettel kopiert das importierte Original-PDF (mit dem eingebetteten XML) nach `Eingangsrechnungen/<Lieferant>/`; maßgeblich ist das Original, nicht die erfassten Felder. Wie lange und in welcher Form du empfangene E-Rechnungen aufbewahren musst, klärst du mit dem Steuerberater.

## GoBD — Grenzen, die du kennen musst

Die [Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen und Unterlagen in elektronischer Form sowie zum Datenzugriff (GoBD)](https://www.bundesfinanzministerium.de/) stellen Anforderungen u.a. an **Unveränderbarkeit**, **Nachvollziehbarkeit**, **Vollständigkeit**, **Zeitgerechtheit** und das Vorhandensein einer **Verfahrensdokumentation**.

**Was Zettel beiträgt:**

- Erzeugte Rechnungs-PDFs sind durch das eingebettete ZUGFeRD-XML inhaltlich identisch maschinen- und menschen-lesbar
- **Änderungsprotokoll:** Datenbank-Trigger schreiben jede Änderung (Anlegen, Ändern, Löschen) an Rechnungen, Positionen, Zahlungen, Mahnungen, Ausgaben, Kunden, Lieferanten und Einstellungen mit alten und neuen Werten in die Tabelle `audit_log`. Die Tabelle ist append-only: Trigger verhindern das Ändern und Löschen von Zeilen, auch für Änderungen über die CLI. „Daten löschen" entfernt das Protokoll nicht.
- **Rechnungssiegel:** Beim Ausstellen (und beim bewussten Zurücksetzen auf Entwurf) hängt Zettel ein Siegel an eine SHA-256-Hash-Kette über den Rechnungsinhalt (`invoice_seals`, ebenfalls append-only).
- **Integritätsprüfung:** Einstellungen → Daten → „Integritätsprüfung" vergleicht jede ausgestellte Rechnung mit ihrem Siegel und meldet unterbrochene Ketten, geänderte oder gelöschte Rechnungen. Das Änderungsprotokoll lässt sich als CSV exportieren.
- Rechnungen mit vergebener Nummer lassen sich nicht löschen und nicht ohne Stornorechnung stornieren; nur Entwürfe ohne Nummer können verworfen werden.
- Stornos werden als Credit Note **zusätzlich** angelegt, nicht als Löschung der Originalrechnung — die ursprüngliche Rechnungsnummer bleibt belegt
- Rechnungs-Nummern sind lückenlos: Drafts bekommen einen `DRAFT-…`-Platzhalter, der echte Nummern-Counter wird erst beim Ausstellen gezogen (siehe `displayInvoiceNumber()`). Gelöschte Drafts erzeugen keine Lücke.
- DATEV-Export (Format 700) erlaubt Übergabe an den Steuerberater in branchenüblichem Format
- Eine ausfüllbare [Vorlage für die Verfahrensdokumentation](./docs/verfahrensdokumentation.md)

**Was Zettel NICHT leistet (das musst du selbst sicherstellen):**

| GoBD-Aspekt | Status in Zettel |
|---|---|
| Append-only Audit-Log aller Änderungen | ⚠️ teilweise — Änderungsprotokoll und Rechnungssiegel sind vorhanden (s. o.), aber **keine qualifizierte elektronische Signatur** und **kein Zeitstempel einer dritten Stelle**. Wer Zugriff auf deinen Rechner hat, kann die gesamte Datenbank ersetzen; dagegen helfen Zugriffsschutz und Backups an getrennten Orten. Ältere Rechnungen werden beim Start nachträglich versiegelt — der Nachweis beginnt für sie erst dann. Nicht protokolliert werden u. a. Angebote, wiederkehrende Rechnungen und Zeiterfassung |
| Versionierung von Stammdaten (Kunde X hatte 2024 Adresse A, 2025 Adresse B) | ⚠️ teilweise — Änderungen an Kunden, Lieferanten und Einstellungen stehen mit alten und neuen Werten im Änderungsprotokoll, eine Versionierung der Stammdaten selbst gibt es nicht (der aktuelle Stand überschreibt den alten). Ausgestellte Rechnungen enthalten den damaligen Kundenstand (Snapshot beim Ausstellen) |
| Verfahrensdokumentation | ⚠️ Du musst sie selbst erstellen — Zettel liefert nur die [Vorlage](./docs/verfahrensdokumentation.md), siehe Abschnitt unten |
| Aufbewahrung der Originale (Fristen siehe unten) | ⚠️ Liegt bei dir — Zettel legt die PDFs im Dokumente-Ordner ab (siehe „Speicherorte"), Backup-Verantwortung ist deine |
| Zertifizierung („GoBD-konform") | ❌ Zettel hat keine Software-Zertifizierung. Eine solche ist auch rechtlich **nicht vorgeschrieben** — entscheidend ist, dass dein **Gesamtprozess** die GoBD erfüllt |

### Du brauchst eine Verfahrensdokumentation

Bei einer Betriebsprüfung kann das Finanzamt verlangen, deine **Verfahrensdokumentation** einzusehen — also eine schriftliche Beschreibung, wie du Belege erfasst, ablegst und aufbewahrst. Das ist **deine Pflicht**, nicht die der Software.

Eine Minimal-Verfahrensdokumentation für einen Solo-Selbstständigen mit Zettel sollte enthalten:

1. **Allgemein:** Wer (du), wo (Privatadresse / Büro), womit (Zettel v0.x.y, Plattform)
2. **Erfassung:** Wie kommen Belege rein? (Eingangsrechnung als ZUGFeRD-PDF → `/expenses` → Drop-Zone; Papier-Belege werden nicht erfasst, weil Zettel kein OCR macht — separate Ablage in Ordner XYZ)
3. **Bearbeitung:** Wer hat Zugriff (nur du), wann werden Rechnungen ausgestellt (in der Regel innerhalb 6 Monate nach Leistungserbringung gemäß § 14 UStG)
4. **Speicherung:** Wo liegen die PDFs (Dokumente-Ordner, siehe „Speicherorte"), wo die DB (siehe `PRIVACY.md`), wie wird gesichert (Backup-Funktion in Zettel → verschlüsseltes ZIP → externe Festplatte / NAS / Cloud nach Wahl), Rotations-Intervall
5. **Aufbewahrung:** Fristen siehe Abschnitt „Aufbewahrungsfristen"; Sicherstellung der Lesbarkeit über diesen Zeitraum (das eingebettete ZUGFeRD-XML hilft hier — PDF/A-3 ist langzeit-archivfähig)
6. **Datenzugriff:** Wie kann eine Betriebsprüfung auf die Daten zugreifen? → DATEV-Export aus Zettel, plus die PDFs

Als Ausgangspunkt dient die mitgelieferte [Vorlage `docs/verfahrensdokumentation.md`](./docs/verfahrensdokumentation.md); sie beschreibt auch die technischen Schutzmechanismen (Änderungsprotokoll, Siegel, Integritätsprüfung, Backup/Restore). Eine weitere Vorlage ist die [Muster-Verfahrensdokumentation der Bundessteuerberaterkammer für die geordnete Belegablage](https://www.bstbk.de/) — frei verfügbar.

## Speicherorte

Zettel legt PDFs (`Rechnungen/`, `Angebote/`, `Mahnungen/`, `Eingangsrechnungen/<Lieferant>/`) und Backups (`Backups/`) unter einem Dokumente-Root ab:

- Standard: `<Dokumente>/Zettel`
- Sandbox: `<Dokumente>/Zettel-Sandbox`
- Eigener Mandant: `<Dokumente>/Zettel/Mandanten/<Mandanten-ID>`

`<Dokumente>` ist der Ordner „Dokumente" des Betriebssystems (unter Windows der bekannte Ordner „Dokumente", er folgt also einer Umleitung nach OneDrive). Die Datenbank liegt davon getrennt im App-Daten-Ordner (siehe [`PRIVACY.md`](./PRIVACY.md)).

## Mail-Übergabe

„Per E-Mail senden" bei Rechnungen, Angeboten und Mahnungen übergibt PDF und Empfänger an dein **lokales Mail-Programm** (Windows: Simple MAPI, macOS: Mail.app, Linux: `xdg-email`; schlägt das fehl, öffnet Zettel einen `mailto:`-Link ohne Anhang und zeigt den PDF-Ordner). Es gibt **keinen SMTP-Versand** durch Zettel und **keine Kopie der versendeten E-Mail** in Zettel.

Das hat eine Konsequenz für die Aufbewahrung: Die versendete E-Mail selbst (Geschäftsbrief, Frist siehe unten) archivierst **du** in deinem Mail-Programm bzw. Mail-Archiv. Zettel kann nicht sicher wissen, ob die Nachricht im Mail-Programm tatsächlich abgeschickt wurde.

## § 14 UStG — Rechnungs-Pflichtangaben

Zettel führt die Pflichtangaben nach § 14 Abs. 4 UStG. Du bist verantwortlich dafür, dass die Felder in den **Einstellungen → Unternehmen** korrekt befüllt sind:

- Vollständiger Name und Anschrift (Aussteller + Empfänger)
- Steuernummer **oder** USt-IdNr. (für Kleinunternehmer reicht die Steuernummer)
- Ausstellungsdatum
- Fortlaufende Rechnungsnummer (Zettel handhabt das)
- Menge / Art der Leistung
- Leistungszeitpunkt / -zeitraum
- Entgelt + Steuersatz / Steuerbetrag — oder bei § 19 UStG der entsprechende Hinweistext

**Hinweistexte werden automatisch eingefügt:**

- § 19 UStG: „Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."
- Reverse-Charge intra-EU: „Steuerschuldnerschaft des Leistungsempfängers / Reverse charge"
- Reverse-Charge Drittland: Hinweis auf Export außerhalb der EU

## § 19 UStG — Kleinunternehmer

Zettel unterstützt den Kleinunternehmer-Modus als First-Class-Feature. Der Schwellenwert (seit 2025: **25.000 € Vorjahr / 100.000 € lfd. Jahr** statt zuvor 22.000 / 50.000 €) wird im Dashboard angezeigt — die Beobachtung des Schwellenwerts liegt jedoch bei dir. Bei Überschreiten musst du in das Regelbesteuerungs-Verfahren wechseln und u.a. die Umsatzsteuer-Voranmeldung abgeben.

## Umsatzsteuer-Voranmeldung (UStVA)

Zettel **bereitet vor**, aber **versendet nicht**. Der UStVA-Report (Auswertung → UStVA) zeigt die Kennzahlen 81/86/41/21/66 pro Quartal. Diese werden in das ELSTER-Formular oder beim Steuerberater eingetragen. Ein automatischer Upload an ELSTER ist **bewusst nicht implementiert**, weil das eine eigene Zertifizierung erfordern und die rechtliche Verantwortung verschieben würde.

## Anlage EÜR

Auswertung → „Anlage EÜR" fasst Betriebseinnahmen und Betriebsausgaben eines Jahres zusammen, sortiert nach den Zeilen des amtlichen Vordrucks. Wie bei der UStVA gilt: Zettel **bereitet vor**, du **tippst die Werte in ELSTER ab** oder gibst sie dem Steuerberater; ein Upload ist **bewusst nicht implementiert**.

- **Zahlungsdatum (Zufluss/Abfluss):** Maßgeblich ist, wann Geld fließt, nicht das Rechnungsdatum. Eine Rechnung zählt anteilig in den Jahren, in denen Zahlungen darauf erfasst sind. Stornorechnungen mindern die Einnahmen erst, wenn die Erstattung als Zahlung auf der Stornorechnung erfasst ist.
- **Nicht enthalten:** AfA, Anlagevermögen, private Nutzung, USt-Zahlungen und -Erstattungen ans Finanzamt sowie Sonderfälle. Diese Posten trägst du selbst nach bzw. klärst sie mit dem Steuerberater.
- **Brutto oder netto:** Ob Ausgaben brutto (Kleinunternehmer) oder netto mit Vorsteuer verbucht werden, richtet sich nach der **aktuellen** Einstellung „Kleinunternehmer", nicht nach dem Rechnungsdatum.
- **Zeilennummern:** hinterlegt für die Formulare **2025** und **2026**; für andere Jahre zeigt Zettel das nächstliegende Formular und weist darauf hin. Welche Ausgabenkategorie in welcher Zeile erscheint, legst du unter Einstellungen → Dokumente → „Anlage EÜR: Ausgabenkategorien" fest; Ausgaben ohne Kategorie landen in „Übrige unbeschränkt abziehbare Betriebsausgaben".
- **Export:** nur als CSV, kein PDF.

## Steuer-Rücklage

Die Berechnung im Dashboard nutzt den **§ 32a EStG-Tarif für VZ 2024, 2025 und 2026** (BMF-Bekanntmachung, hartcodiert). Sie ist eine **Schätzung**, kein Steuerbescheid:

- Berücksichtigt: ESt, Soli (Milderungszone), Kirchensteuer 8/9 %, GewSt mit § 35-Anrechnung, Splittingtarif bei Verheirateten
- **Nicht berücksichtigt:** Werbungskosten, Sonderausgaben, außergewöhnliche Belastungen, Verlustvorträge, individuelle Freibeträge, Kirchensteuer-Sonderausgaben-Abzug, Nebenberuf-Spezialfälle jenseits einfacher marginaler ESt

Verwende die Zahl als groben Anhalt für Rücklagen, nicht für die Steuererklärung.

## Aufbewahrungsfristen (§ 147 AO)

*Keine Rechtsberatung — Fristen im Einzelfall mit Steuerberater abstimmen.*

| Unterlagen | Frist |
|---|---|
| Buchungsbelege, z. B. Ausgangs- und Eingangsrechnungen | 8 Jahre¹ |
| Bücher, Aufzeichnungen, Jahresabschlüsse, Inventare, Verfahrensdokumentation | 10 Jahre |
| Empfangene und abgesandte Handels- und Geschäftsbriefe (z. B. Angebote, Mahnungen, versendete E-Mails) | 6 Jahre |

¹ § 147 Abs. 3 AO in der Fassung des Bürokratieentlastungsgesetzes IV; gilt für Unterlagen, deren Aufbewahrungsfrist am 1.1.2025 noch nicht abgelaufen war.

Frist beginnt jeweils mit dem Schluss des Kalenderjahres, in dem der Beleg entstanden ist. **Du** musst sicherstellen, dass die Dateien aus dem Dokumente-Ordner (siehe „Speicherorte") und die Backups so lange lesbar bleiben. Faustregel: 2× jährlich verschlüsseltes Backup auf externes Medium, zusätzlich Cloud nach Wahl. Während der Frist keine Belege oder Daten löschen; die Funktion „Daten löschen" gehört nicht in den Echtbetrieb.

## Haftungsausschluss

Zettel wird unter der MIT-Lizenz **„as is"** bereitgestellt — siehe [`LICENSE`](./LICENSE). Es besteht **kein Anspruch** auf Fehlerfreiheit, GoBD-Konformität, EN-16931-Konformität oder steuerliche Korrektheit der erzeugten Dokumente und Reports. Die Verantwortung für die Richtigkeit deiner Rechnungen, deiner Buchführung und deiner Steuererklärungen liegt **vollständig bei dir**.

Bug-Reports sind willkommen und werden ernst genommen — aber das ist ein Open-Source-Indie-Projekt, kein zertifiziertes ERP.
