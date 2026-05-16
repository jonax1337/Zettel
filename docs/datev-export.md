# DATEV-Export

Zettel exportiert deine Rechnungen als **DATEV-Buchungsstapel** (Format 700,
Format-Name „Buchungsstapel" = 21). Die CSV kannst du deinem Steuerberater
geben — DATEV-Unternehmen-Online und DATEV Kanzlei-Rechnungswesen importieren
das Format direkt.

## Workflow

1. **Export → DATEV-CSV speichern** in der App
2. Zeitraum wählen (Default: Jahresanfang bis heute)
3. Kontenrahmen wählen (SKR03 oder SKR04)
4. Datei speichern, dem Steuerberater per Mail/Cloud schicken

Nur Rechnungen mit Status **Versandt** oder **Bezahlt** werden exportiert.
Entwürfe und stornierte Rechnungen bleiben draußen.

## Kontenmapping

| Sachverhalt | SKR03 | SKR04 |
|---|---|---|
| Debitor (Sammelkonto) | 10000 | 12000 |
| Erlöse 19 % USt | 8400 | 4400 |
| Erlöse 7 % USt | 8300 | 4300 |
| Steuerfreie Umsätze (§ 19 UStG) | 8200 | 4200 |
| Steuerfreie innergem. Lieferung (Reverse-Charge) | 8336 | 4125 |

Der Steuerberater kann beim Import problemlos auf eigene Konten umbuchen.

## Was eine Rechnung in DATEV-Zeilen wird

- **Eine Zeile pro USt-Rate** der Rechnung
- **Soll-/Haben:** Sammel-Debitor 10000 ist immer Soll, das passende
  Erlöskonto ist Haben — die Rechnung wird also als Forderung gegen den Kunden
  gebucht
- **Belegfeld 1** = Rechnungsnummer
- **Buchungstext** = „Rechnung &lt;Kundenname&gt;"
- **EU-Land u. UStID (Bestimmung)** = USt-IdNr. des Kunden bei
  Reverse-Charge-Rechnungen

## Was nicht abgedeckt ist (v0.2)

- Einzel-Debitorenkonten pro Kunde — alle Buchungen laufen über das
  Sammelkonto 10000 (SKR03) bzw. 12000 (SKR04)
- BU-Schlüssel (Steuerschlüssel-Override) — die Erlöskonten in SKR03/SKR04
  sind bereits steuersatz-codiert
- Kostenstellen (KOST1/KOST2)
- Stornobelege als Gegenbuchung

Diese Felder können in einer späteren Version dazukommen — meld dich gern in
einem Issue, wenn du sie brauchst.

## Beispiel

[`datev-export-sample.csv`](./datev-export-sample.csv) zeigt einen Stapel mit
vier Rechnungen: eine Standard-Rechnung (19 %), eine gemischte Rechnung
(7 % + 19 %), eine Kleinunternehmer-Rechnung (0 %, steuerfrei) und eine
Reverse-Charge-Rechnung an einen niederländischen B2B-Kunden.

## Spezifikation

[DATEV Developer Portal — DTVF/EXTF Grundlagen](https://developer.datev.de/portal/de/dtvf/grundlagen)
