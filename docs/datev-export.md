# DATEV-Export

Zettel exportiert deine **Rechnungen (Erlöse)** und **Eingangsrechnungen (Aufwände)**
als **DATEV-Buchungsstapel** (Format 700, Format-Name „Buchungsstapel" = 21).
Die CSV kannst du deinem Steuerberater geben — DATEV-Unternehmen-Online und
DATEV Kanzlei-Rechnungswesen importieren das Format direkt.

## Workflow

1. In der App **Auswertung → DATEV-Export** öffnen
2. Zeitraum wählen (Standard: Jahresanfang bis heute). Ein Stapel darf nur
   **ein Wirtschaftsjahr** umfassen: das DATEV-Belegdatum hat kein Jahr (`TTMM`),
   Zettel lehnt längere Zeiträume ab. Jedes Jahr einzeln exportieren.
3. Kontenrahmen wählen (SKR03 oder SKR04)
4. Festlegen, ob Rechnungen, Eingangsrechnungen und stornierte Eingangsrechnungen
   mit in den Stapel sollen (Standard: alles); die Vorschau zeigt die Anzahl
5. Datei speichern, dem Steuerberater per Mail/Cloud schicken

Berater- und Mandantennummer im Header kannst du auf dem Export-Bildschirm eintragen
(Felder „Beraternr. (Platzhalter)“ und „Mandantennr. (Platzhalter)“, Zettel merkt sich
die letzte Eingabe); ohne deine Angaben sind sie Platzhalter. Dein Steuerberater trägt
sie beim Import um. Der Stapel wird nicht festgeschrieben, die Datei ist UTF-8 mit
BOM, Zeilenenden sind CRLF.

## Welche Belege exportiert werden

| Beleg | Aufnahme | Datum |
|---|---|---|
| Rechnungen und Stornorechnungen | Status **Versendet**, **Teilbezahlt** oder **Bezahlt** | Rechnungsdatum |
| Eingangsrechnungen | Status **Offen** oder **Bezahlt**; **Storniert** nur, wenn die Option gesetzt ist | Belegdatum |

Entwürfe und verworfene Rechnungen bleiben draußen. Exportiert werden nur
Rechnungen und Eingangsrechnungen — **Zahlungsein- und -ausgänge werden nicht
gebucht**.

## Kontenmapping

### Erlöse (Rechnungen)

| Sachverhalt | SKR03 | SKR04 |
|---|---|---|
| Debitor (Sammelkonto) | 10000 | 12000 |
| Erlöse 19 % USt | 8400 | 4400 |
| Erlöse 7 % USt | 8300 | 4300 |
| Steuerfreie Umsätze (§ 19 UStG, 0 %) | 8200 | 4200 |
| Steuerfreie innergem. Lieferung (§ 4 Nr. 1b UStG) | 8125 | 4125 |
| Im anderen EU-Land steuerpflichtige sonstige Leistung (§ 13b UStG) | 8336 | 4336 |
| Steuerfreie Ausfuhrlieferung (§ 4 Nr. 1a UStG) | 8120 | 4120 |
| Im Drittland steuerbare sonstige Leistung | 8338 | 4338 |

Die vier Reverse-Charge-Konten werden nach Art des Reverse-Charge
(innergemeinschaftlich bzw. Drittland) und Leistungsart der Rechnung
(Lieferung bzw. sonstige Leistung) gewählt; Gutschriften nutzen dasselbe Konto
wie ihre Rechnung. Das sind die Konten der DATEV-Standardkontenrahmen — der
Steuerberater kann sie beim Import problemlos auf eigene Konten umbuchen.

### Aufwände (Eingangsrechnungen)

| Sachverhalt | SKR03 | SKR04 |
|---|---|---|
| Kreditor (Sammelkonto) | 70000 | 73000 |
| Aufwand mit 19 % Vorsteuer | 3400 | 5400 |
| Aufwand mit 7 % Vorsteuer | 3300 | 5300 |
| Aufwand ohne Vorsteuerabzug (0 %, z. B. Kleinunternehmer-Lieferant) | 3200 | 5200 |
| Aufwand Reverse-Charge-Bezug (§ 13b UStG) | 3123 | 5923 |

Welches Aufwandskonto ein Posten bekommt, entscheidet diese Reihenfolge:

1. Ein am Posten eingetragenes **DATEV-Konto** (Katalog-Vorgabe oder von Hand).
2. Das Konto der gewählten **Ausgaben-Kategorie** für den gewählten Kontenrahmen
   (die zehn mitgelieferten Kategorien tragen SKR03- und SKR04-Konten).
3. Das Standardkonto aus der Tabelle oben, nach USt-Satz bzw. Reverse Charge.

Achtung: Wählst du im Formular eine Kategorie, trägt Zettel deren **SKR03**-Konto
als DATEV-Konto am Posten ein (Punkt 1). Wer SKR04 exportiert, sollte diese Konten
prüfen und gegebenenfalls leeren, damit Punkt 2 greift.

## Was ein Beleg in DATEV-Zeilen wird

- **Rechnungen:** eine Zeile pro USt-Satz. Sammel-Debitor ist Konto (Soll), das
  passende Erlöskonto Gegenkonto (Haben) — die Rechnung wird als Forderung gegen
  den Kunden gebucht. Beträge sind brutto (inkl. USt). Kleinunternehmer- und
  Reverse-Charge-Rechnungen werden mit Satz 0 gebucht.
- **Eingangsrechnungen:** eine Zeile pro Kombination aus Aufwandskonto und
  USt-Satz. Aufwandskonto ist Konto (Soll), Sammel-Kreditor Gegenkonto (Haben).
- **Belegfeld 1** = Rechnungsnummer bzw. interne Nummer der Eingangsrechnung
- **Buchungstext** = „Rechnung &lt;Kundenname&gt;", „Storno &lt;Kundenname&gt;" bzw.
  „Eingangsrechnung &lt;Lieferant&gt; (&lt;Lieferantennummer&gt;)" (auf 60 Zeichen gekürzt)
- **EU-Land u. UStID (Bestimmung)** = USt-IdNr. des Kunden bzw. Lieferanten bei
  Reverse-Charge-Belegen
- **Fremdwährung:** gebucht wird in EUR; maßgeblich ist der bei der Rechnung
  eingefrorene EUR-Betrag, der auf die USt-Sätze verteilt wird.

## Stornos

- **Stornorechnungen** (Gutschriften) werden als Gegenbuchung exportiert: dieselben
  Konten, Soll/Haben gedreht, Buchungstext „Storno …".
- **Stornierte Eingangsrechnungen** werden (wenn die Option gesetzt ist) ebenfalls
  mit gedrehtem Soll/Haben exportiert, Buchungstext „Storno …".
- Ein negativer Betrag (z. B. eine Rabattzeile mit eigenem USt-Satz) kehrt die
  Richtung ebenfalls um, denn DATEV-Beträge haben kein Vorzeichen.

## Was nicht abgedeckt ist

- Einzel-Debitoren- und -Kreditorenkonten pro Kunde bzw. Lieferant — alle Buchungen
  laufen über die Sammelkonten (10000/70000 bei SKR03, 12000/73000 bei SKR04)
- Zahlungsbuchungen (Bank/Kasse) und Skonto-Buchungen
- BU-Schlüssel (Steuerschlüssel-Override) — die Erlöskonten sind bereits
  steuersatz-codiert; das Feld bleibt leer
- Kostenstellen (KOST1/KOST2)

Diese Felder können in einer späteren Version dazukommen — meld dich gern in
einem Issue, wenn du sie brauchst.

## Beispiel

[`datev-export-sample.csv`](./datev-export-sample.csv) zeigt einen Stapel mit
vier Rechnungen: eine Standard-Rechnung (19 %), eine gemischte Rechnung
(7 % + 19 %), eine Kleinunternehmer-Rechnung (0 %, steuerfrei) und eine
Reverse-Charge-Rechnung an einen niederländischen B2B-Kunden. Eingangsrechnungen
enthält das Beispiel nicht.

## Spezifikation

[DATEV Developer Portal — DTVF/EXTF Grundlagen](https://developer.datev.de/portal/de/dtvf/grundlagen)
