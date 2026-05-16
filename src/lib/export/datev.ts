/**
 * DATEV-Format-Export für Zettel-Rechnungen.
 *
 * Format: DATEV-CSV-Format (DTVF/EXTF), Buchungsstapel (Format-Name 21).
 * Spezifikation: https://developer.datev.de/portal/de/dtvf/grundlagen
 *
 * Eine Rechnung wird in 1..n Buchungszeilen exportiert — eine Zeile pro
 * USt-Rate (bei gemischten Rechnungen also mehrere Zeilen). Soll = Debitor-
 * Sammelkonto, Haben = Erlöskonto passend zum Steuersatz / Sonderfall.
 *
 * Die Datei wird mit UTF-8-BOM ausgegeben; DATEV-Importer akzeptieren das seit
 * Format-Version 700 problemlos. Wer den klassischen cp1252-Strom braucht,
 * kann das beim Schreiben übersetzen.
 */
import type { Invoice, InvoiceItem } from "$lib/db/schema";

export type DatevAccountMap = {
  /** Sammel-Debitor (Forderungen aus Lieferungen und Leistungen). */
  debitor: number;
  /** Erlöse 19 % USt. */
  revenue19: number;
  /** Erlöse 7 % USt. */
  revenue7: number;
  /** Steuerfreie Umsätze (§ 19 UStG / 0 %). */
  revenueExempt: number;
  /** Steuerfreie innergemeinschaftliche Lieferung (Reverse-Charge). */
  revenueIntraEu: number;
};

export const SKR03: DatevAccountMap = {
  debitor: 10000,
  revenue19: 8400,
  revenue7: 8300,
  revenueExempt: 8200,
  revenueIntraEu: 8336,
};

export const SKR04: DatevAccountMap = {
  debitor: 12000,
  revenue19: 4400,
  revenue7: 4300,
  revenueExempt: 4200,
  revenueIntraEu: 4125,
};

export type Skr = "SKR03" | "SKR04";

export const ACCOUNT_MAPS: Record<Skr, DatevAccountMap> = {
  SKR03,
  SKR04,
};

export type DatevExportOpts = {
  /** 7-stellige DATEV-Beraternummer (Default 1001 als Platzhalter). */
  beraternr: number;
  /** Mandantennummer beim Steuerberater (Default 1). */
  mandantennr: number;
  /** Beginn des Wirtschaftsjahres (in der Regel 1.1.). */
  wjBeginn: Date;
  /** Erste erfasste Buchung des Stapels. */
  dateFrom: Date;
  /** Letzte erfasste Buchung des Stapels. */
  dateTo: Date;
  /** Sachkontenlänge (4 für SKR03/SKR04 Standard). */
  sachkontenlaenge: 4 | 5 | 6 | 7 | 8;
  /** Freitext-Bezeichnung des Stapels (max. 30 Zeichen). */
  bezeichnung: string;
  /** Kontenrahmen-Mapping. */
  accounts: DatevAccountMap;
};

export type DatevInvoiceInput = {
  invoice: Invoice;
  items: InvoiceItem[];
  customerName: string;
  customerVatId: string | null;
};

// ----- Helpers -----

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function fmtDdmm(d: Date): string {
  return `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}`;
}

function fmtYyyymmdd(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function fmtHeaderTimestamp(d: Date): string {
  // YYYYMMDDhhmmssfff
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}${ms}`
  );
}

function centsToDatev(cents: number): string {
  // DATEV erwartet positive Beträge mit Komma als Dezimaltrenner.
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${euros},${pad2(rest)}`;
}

function quote(s: string): string {
  // CSV-Quoting: doppelte Anführungszeichen escapen, dann in Anführungszeichen.
  return `"${s.replace(/"/g, '""')}"`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

// ----- Booking-row construction -----

type Booking = {
  amountCents: number;
  debit: number;
  credit: number;
  /** "S" = standard Forderung. "H" flips the booking direction for credit notes. */
  sollHaben: "S" | "H";
  buSchluessel: string;
  belegdatum: Date;
  belegfeld1: string;
  buchungstext: string;
  euVatId: string | null;
  euLand: string | null;
};

function revenueAccountFor(
  vatRate: number,
  isKleinunternehmer: boolean,
  isReverseCharge: boolean,
  accounts: DatevAccountMap,
): number {
  if (isReverseCharge) return accounts.revenueIntraEu;
  if (isKleinunternehmer) return accounts.revenueExempt;
  if (vatRate === 19) return accounts.revenue19;
  if (vatRate === 7) return accounts.revenue7;
  return accounts.revenueExempt;
}

/**
 * Group invoice items by their effective VAT rate and produce one booking row
 * per group. Returns gross amounts (including VAT) per row so the importer
 * doesn't need to re-calculate.
 */
function bookingsForInvoice(input: DatevInvoiceInput, accounts: DatevAccountMap): Booking[] {
  const { invoice, items, customerName, customerVatId } = input;
  const isKu = invoice.isKleinunternehmer;
  const isRc = invoice.isReverseCharge;

  // Gruppen-Key = effektive Rate für die Buchung (bei KU/RC immer 0).
  const groups = new Map<number, { net: number; vat: number }>();
  for (const it of items) {
    const effectiveRate = isKu || isRc ? 0 : it.vatRate;
    const net = it.lineTotal;
    const vat = isKu || isRc ? 0 : Math.round((net * it.vatRate) / 100);
    const g = groups.get(effectiveRate) ?? { net: 0, vat: 0 };
    g.net += net;
    g.vat += vat;
    groups.set(effectiveRate, g);
  }

  const dueDate = new Date(invoice.issueDate * 1000);
  const isCn = invoice.isCreditNote;
  const out: Booking[] = [];
  const sortedRates = [...groups.keys()].sort((a, b) => a - b);
  for (const rate of sortedRates) {
    const g = groups.get(rate)!;
    const gross = g.net + g.vat;
    out.push({
      amountCents: gross,
      debit: accounts.debitor,
      credit: revenueAccountFor(rate, isKu, isRc, accounts),
      sollHaben: isCn ? "H" : "S",
      buSchluessel: "",
      belegdatum: dueDate,
      belegfeld1: invoice.number,
      buchungstext: truncate(`${isCn ? "Storno" : "Rechnung"} ${customerName}`, 60),
      euVatId: isRc ? customerVatId : null,
      euLand: isRc && customerVatId ? customerVatId.slice(0, 2) : null,
    });
  }
  return out;
}

// ----- CSV assembly -----

/** DATEV-Spalten in der Reihenfolge laut Spec 7.00 (Auszug, nur Pflicht + EU). */
const COLUMN_HEADERS = [
  "Umsatz (ohne Soll-/Haben-Kz)",
  "Soll-/Haben-Kennzeichen",
  "WKZ Umsatz",
  "Kurs",
  "Basis-Umsatz",
  "WKZ Basis-Umsatz",
  "Konto",
  "Gegenkonto (ohne BU-Schlüssel)",
  "BU-Schlüssel",
  "Belegdatum",
  "Belegfeld 1",
  "Belegfeld 2",
  "Skonto",
  "Buchungstext",
  "Postensperre",
  "Diverse Adressnummer",
  "Geschäftspartnerbank",
  "Sachverhalt",
  "Zinssperre",
  "Beleglink",
  "Beleginfo - Art 1",
  "Beleginfo - Inhalt 1",
  "Beleginfo - Art 2",
  "Beleginfo - Inhalt 2",
  "Beleginfo - Art 3",
  "Beleginfo - Inhalt 3",
  "Beleginfo - Art 4",
  "Beleginfo - Inhalt 4",
  "Beleginfo - Art 5",
  "Beleginfo - Inhalt 5",
  "Beleginfo - Art 6",
  "Beleginfo - Inhalt 6",
  "Beleginfo - Art 7",
  "Beleginfo - Inhalt 7",
  "Beleginfo - Art 8",
  "Beleginfo - Inhalt 8",
  "KOST1 - Kostenstelle",
  "KOST2 - Kostenstelle",
  "Kost-Menge",
  "EU-Land u. UStID (Bestimmung)",
  "EU-Steuersatz (Bestimmung)",
  "Abw. Versteuerungsart",
  "Sachverhalt L+L",
  "Funktionsergänzung L+L",
  "BU 49 Hauptfunktiontyp",
  "BU 49 Hauptfunktionsnummer",
  "BU 49 Funktionsergänzung",
  "Zusatzinformation - Art 1",
  "Zusatzinformation - Inhalt 1",
];

function buildHeaderLine(opts: DatevExportOpts, now: Date): string {
  // DATEV-Header für Format 700, Buchungsstapel (21).
  // Spec: https://developer.datev.de/datev/platform/en/dtvf/formate/header
  const fields: Array<string | number> = [
    quote("EXTF"),
    700,
    21,
    quote("Buchungsstapel"),
    9,
    fmtHeaderTimestamp(now),
    "", // imported on (leer = Stapel ist neu)
    quote("Zettel"),
    quote(""), // Importeur-Kennzeichen
    quote(""),
    opts.beraternr,
    opts.mandantennr,
    fmtYyyymmdd(opts.wjBeginn),
    opts.sachkontenlaenge,
    fmtYyyymmdd(opts.dateFrom),
    fmtYyyymmdd(opts.dateTo),
    quote(truncate(opts.bezeichnung, 30)),
    quote(""), // Diktatkürzel
    1,         // Buchungstyp: 1 = Finanzbuchführung
    0,         // Rechnungslegungszweck
    0,         // Festschreibung (0 = nicht festgeschrieben)
    quote("EUR"),
    "", "", "", "",
    "", "",
  ];
  return fields.join(";");
}

function rowFor(b: Booking): string {
  const fields: string[] = new Array(COLUMN_HEADERS.length).fill("");
  fields[0] = centsToDatev(b.amountCents);
  fields[1] = quote(b.sollHaben);
  fields[2] = quote("EUR");
  fields[6] = String(b.debit);
  fields[7] = String(b.credit);
  fields[8] = b.buSchluessel; // numerischer Schlüssel, ohne Quotes
  fields[9] = fmtDdmm(b.belegdatum);
  fields[10] = quote(b.belegfeld1);
  fields[13] = quote(b.buchungstext);
  if (b.euVatId) fields[39] = quote(b.euVatId);
  return fields.join(";");
}

/** UTF-8-BOM-Präfix, von DATEV ab Format 700 akzeptiert. */
export const UTF8_BOM = "﻿";

export function buildDatevCsv(
  inputs: DatevInvoiceInput[],
  opts: DatevExportOpts,
  now: Date = new Date(),
): string {
  const headerLine = buildHeaderLine(opts, now);
  const columnLine = COLUMN_HEADERS.map(quote).join(";");
  const rows: string[] = [];
  for (const input of inputs) {
    for (const b of bookingsForInvoice(input, opts.accounts)) {
      rows.push(rowFor(b));
    }
  }
  // DATEV erwartet CRLF.
  return UTF8_BOM + [headerLine, columnLine, ...rows].join("\r\n") + "\r\n";
}

export function defaultDatevFilename(now: Date = new Date()): string {
  // EXTF_Buchungsstapel_YYYYMMDD.csv — gängiges Pattern für DATEV-Importe.
  return `EXTF_Buchungsstapel_${fmtYyyymmdd(now)}_${pad4(now.getHours() * 100 + now.getMinutes())}.csv`;
}
