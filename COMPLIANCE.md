# Compliance & rechtliche Hinweise

Zettel erzeugt elektronische Rechnungen nach **EN 16931** (ZUGFeRD/Factur-X) und bereitet Daten für die deutsche Buchführung vor. Damit ist Zettel ein **Hilfsmittel**, keine vollständige Buchhaltungssoftware — und ersetzt erst recht keinen Steuerberater.

Dieses Dokument beschreibt, was Zettel kann, was bewusst nicht abgedeckt ist, und wo du als Nutzer selbst tätig werden musst.

## Keine Rechts- oder Steuerberatung

Die Inhalte dieser Datei sowie der Anwendung sind eine **technische Beschreibung**, keine Rechtsberatung. Konkrete Fragen zu Aufbewahrung, GoBD-Konformität, Umsatzsteuer-Behandlung oder Bilanzierung bitte mit deinem **Steuerberater** oder einer **Rechtsanwältin** klären. Die ersten Rechnungen vor dem produktiven Versand prüfen lassen.

## EN 16931 / ZUGFeRD / Factur-X

Zettel erzeugt PDF/A-3 mit eingebettetem CII-XML in den Profilen **BASIC**, **EN 16931** und **EXTENDED**. Validiert wird gegen den offiziellen [KoSIT-Validator](https://github.com/itplr-kosit/validator) (im Release-Build mitgeliefert).

**Was wir nach bestem Wissen umsetzen:**

- BR-CO-26-konformer `BT-29`-Fallback für Kleinunternehmer ohne USt-IdNr.
- Reverse-Charge intra-EU (`CategoryCode K`) und Drittland (`CategoryCode G`) inkl. Pflicht-Hinweistexte
- Storno als first-class Credit Note (CII `InvoiceReferencedDocument` in `ApplicableHeaderTradeSettlement`)
- Leistungszeiträume auf Header- (BG-14, BT-73/74) und Positions-Ebene (BG-26, BT-134/135)
- Lange Positions-Beschreibungen (BT-154)

**Aber:** Validierungs-Profile entwickeln sich weiter. Wir testen gegen den aktuellen KoSIT-Validator zum Zeitpunkt jedes Releases. Wenn dein Empfänger eine spezielle Validierungs-Regel (z.B. XRechnung 3.0.x, ein bestimmtes B2B-Portal) anwendet, kann es Edge-Cases geben. Bug-Reports mit konkretem Validator-Output sind willkommen — siehe Issue-Template „ZUGFeRD validation".

## GoBD — Grenzen, die du kennen musst

Die [Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen und Unterlagen in elektronischer Form sowie zum Datenzugriff (GoBD)](https://www.bundesfinanzministerium.de/) stellen Anforderungen u.a. an **Unveränderbarkeit**, **Nachvollziehbarkeit**, **Vollständigkeit**, **Zeitgerechtheit** und das Vorhandensein einer **Verfahrensdokumentation**.

**Was Zettel beiträgt:**

- Erzeugte Rechnungs-PDFs sind durch das eingebettete ZUGFeRD-XML inhaltlich identisch maschinen- und menschen-lesbar
- Stornos werden als Credit Note **zusätzlich** angelegt, nicht als Löschung der Originalrechnung — die ursprüngliche Rechnungsnummer bleibt belegt
- Rechnungs-Nummern sind lückenlos: Drafts bekommen einen `DRAFT-…`-Platzhalter, der echte Nummern-Counter wird erst beim Versand gezogen (siehe `displayInvoiceNumber()`). Gelöschte Drafts erzeugen keine Lücke.
- DATEV-Export (Format 700) erlaubt Übergabe an den Steuerberater in branchenüblichem Format

**Was Zettel NICHT leistet (das musst du selbst sicherstellen):**

| GoBD-Aspekt | Status in Zettel |
|---|---|
| Append-only Audit-Log aller Änderungen | ❌ nicht vorhanden — wer in Zettel eine versendete Rechnung editiert, lässt keine Historie in der App zurück. Schutz erfolgt organisatorisch (nur ausstellen, was final ist) und durch das versendete PDF beim Kunden |
| Versionierung von Stammdaten (Kunde X hatte 2024 Adresse A, 2025 Adresse B) | ❌ Stammdaten werden überschrieben — historische Rechnungs-PDFs enthalten den damaligen Stand korrekt (Snapshot beim Ausstellen) |
| Verfahrensdokumentation | ⚠️ Du musst sie selbst erstellen — siehe Abschnitt unten |
| Aufbewahrung der Originale für **10 Jahre** (§ 147 AO) | ⚠️ Liegt bei dir — Zettel legt die PDFs unter `~/Documents/Zettel/` ab, Backup-Verantwortung ist deine |
| Zertifizierung („GoBD-konform") | ❌ Zettel hat keine Software-Zertifizierung. Eine solche ist auch rechtlich **nicht vorgeschrieben** — entscheidend ist, dass dein **Gesamtprozess** die GoBD erfüllt |

### Du brauchst eine Verfahrensdokumentation

Bei einer Betriebsprüfung kann das Finanzamt verlangen, deine **Verfahrensdokumentation** einzusehen — also eine schriftliche Beschreibung, wie du Belege erfasst, ablegst und aufbewahrst. Das ist **deine Pflicht**, nicht die der Software.

Eine Minimal-Verfahrensdokumentation für einen Solo-Selbstständigen mit Zettel sollte enthalten:

1. **Allgemein:** Wer (du), wo (Privatadresse / Büro), womit (Zettel v0.x.y, Plattform)
2. **Erfassung:** Wie kommen Belege rein? (Eingangsrechnung als ZUGFeRD-PDF → `/expenses` → Drop-Zone; Papier-Belege werden nicht erfasst, weil Zettel kein OCR macht — separate Ablage in Ordner XYZ)
3. **Bearbeitung:** Wer hat Zugriff (nur du), wann werden Rechnungen ausgestellt (in der Regel innerhalb 6 Monate nach Leistungserbringung gemäß § 14 UStG)
4. **Speicherung:** Wo liegen die PDFs (`~/Documents/Zettel/`), wo die DB (siehe `PRIVACY.md`), wie wird gesichert (Backup-Funktion in Zettel → verschlüsseltes ZIP → externe Festplatte / NAS / Cloud nach Wahl), Rotations-Intervall
5. **Aufbewahrung:** Mindestens 10 Jahre (§ 147 Abs. 3 AO), Sicherstellung der Lesbarkeit über diesen Zeitraum (das eingebettete ZUGFeRD-XML hilft hier — PDF/A-3 ist langzeit-archivfähig)
6. **Datenzugriff:** Wie kann eine Betriebsprüfung auf die Daten zugreifen? → DATEV-Export aus Zettel, plus die PDFs

Eine Vorlage ist die [Muster-Verfahrensdokumentation der Bundessteuerberaterkammer für die geordnete Belegablage](https://www.bstbk.de/) — frei verfügbar.

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

Zettel **bereitet vor**, aber **versendet nicht**. Der `/ustva`-Report zeigt die Kennzahlen 81/86/41/21/66 pro Quartal. Diese werden in das ELSTER-Formular oder beim Steuerberater eingetragen. Ein automatischer Upload an ELSTER ist **bewusst nicht implementiert**, weil das eine eigene Zertifizierung erfordern und die rechtliche Verantwortung verschieben würde.

## Steuer-Rücklage

Die Berechnung im Dashboard nutzt den **§ 32a EStG-Tarif für VZ 2024, 2025 und 2026** (BMF-Bekanntmachung, hartcodiert). Sie ist eine **Schätzung**, kein Steuerbescheid:

- Berücksichtigt: ESt, Soli (Milderungszone), Kirchensteuer 8/9 %, GewSt mit § 35-Anrechnung, Splittingtarif bei Verheirateten
- **Nicht berücksichtigt:** Werbungskosten, Sonderausgaben, außergewöhnliche Belastungen, Verlustvorträge, individuelle Freibeträge, Kirchensteuer-Sonderausgaben-Abzug, Nebenberuf-Spezialfälle jenseits einfacher marginaler ESt

Verwende die Zahl als groben Anhalt für Rücklagen, nicht für die Steuererklärung.

## Aufbewahrungsfristen (§ 147 AO)

| Belegtyp | Frist |
|---|---|
| Ausgangsrechnungen | 10 Jahre |
| Eingangsrechnungen | 10 Jahre |
| Geschäftsbriefe (auch Angebote, Mahnungen) | 6 Jahre |
| Buchungsbelege | 10 Jahre |

Frist beginnt jeweils mit dem Schluss des Kalenderjahres, in dem der Beleg entstanden ist. **Du** musst sicherstellen, dass die Dateien aus `~/Documents/Zettel/` und die Backups so lange lesbar bleiben. Faustregel: 2× jährlich verschlüsseltes Backup auf externes Medium, zusätzlich Cloud nach Wahl.

## Haftungsausschluss

Zettel wird unter der MIT-Lizenz **„as is"** bereitgestellt — siehe [`LICENSE`](./LICENSE). Es besteht **kein Anspruch** auf Fehlerfreiheit, GoBD-Konformität, EN-16931-Konformität oder steuerliche Korrektheit der erzeugten Dokumente und Reports. Die Verantwortung für die Richtigkeit deiner Rechnungen, deiner Buchführung und deiner Steuererklärungen liegt **vollständig bei dir**.

Bug-Reports sind willkommen und werden ernst genommen — aber das ist ein Open-Source-Indie-Projekt, kein zertifiziertes ERP.
