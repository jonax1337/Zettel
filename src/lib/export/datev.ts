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
import type { Expense, ExpenseItem, Invoice, InvoiceItem } from "$lib/db/schema";
import { CSV_LINE_BREAK, UTF8_BOM } from "$lib/utils/csv";

export { UTF8_BOM };

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
  /** Sammel-Kreditor (Verbindlichkeiten aus Lieferungen und Leistungen). */
  kreditor: number;
  /** Aufwand mit 19 % Vorsteuerabzug. */
  expense19: number;
  /** Aufwand mit 7 % Vorsteuerabzug. */
  expense7: number;
  /** Aufwand ohne Vorsteuerabzug (z. B. Kleinunternehmer-Lieferant). */
  expenseExempt: number;
  /** Aufwand Reverse-Charge-Bezug (§ 13b UStG). */
  expenseReverseCharge: number;
};

export const SKR03: DatevAccountMap = {
  debitor: 10000,
  revenue19: 8400,
  revenue7: 8300,
  revenueExempt: 8200,
  revenueIntraEu: 8336,
  kreditor: 70000,
  expense19: 3400,
  expense7: 3300,
  expenseExempt: 3200,
  expenseReverseCharge: 3123,
};

export const SKR04: DatevAccountMap = {
  debitor: 12000,
  revenue19: 4400,
  revenue7: 4300,
  revenueExempt: 4200,
  revenueIntraEu: 4125,
  kreditor: 73000,
  expense19: 5400,
  expense7: 5300,
  expenseExempt: 5200,
  expenseReverseCharge: 5923,
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

export type DatevExpenseInput = {
  expense: Expense;
  items: ExpenseItem[];
  vendorName: string;
  vendorVatId: string | null;
};

// ----- Helpers -----

const MAX_BOOKING_TEXT_LENGTH = 60;
const MAX_BATCH_LABEL_LENGTH = 30;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
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
  return `${fmtYyyymmdd(d)}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}${ms}`;
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

/** Line VAT, rounded per line like the invoice totals. */
function lineVat(item: { lineTotal: number; vatRate: number }): number {
  return Math.round((item.lineTotal * item.vatRate) / 100);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// ----- Booking-row construction -----

type SollHaben = "S" | "H";

type Booking = {
  /** Signed gross; a negative amount (e.g. a discount line on its own VAT rate) reverses the direction. */
  amountCents: number;
  debit: number;
  credit: number;
  /** Direction of a positive amount: "S" = standard, "H" for credit notes / cancelled expenses. */
  sollHaben: SollHaben;
  belegdatum: Date;
  belegfeld1: string;
  buchungstext: string;
  euVatId: string | null;
};

type RateGroup = { rate: number; gross: number };

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

/** Gross amount (incl. VAT) per effective VAT rate, ascending by rate. KU/RC invoices book everything at rate 0. */
function grossByEffectiveRate(items: InvoiceItem[], vatExempt: boolean): RateGroup[] {
  const grossByRate = new Map<number, number>();
  for (const item of items) {
    const rate = vatExempt ? 0 : item.vatRate;
    const vat = vatExempt ? 0 : lineVat(item);
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + item.lineTotal + vat);
  }
  return [...grossByRate]
    .map(([rate, gross]) => ({ rate, gross }))
    .sort((a, b) => a.rate - b.rate);
}

/**
 * Scales each group's gross to its share of the invoice's authoritative EUR
 * total. The rounding residual goes to the group with the largest absolute
 * gross (first one on ties) so the bookings sum exactly to `eurTotal`.
 */
function apportionEurTotal(groups: RateGroup[], eurTotal: number): RateGroup[] {
  const originalTotal = sum(groups.map((g) => g.gross));
  if (originalTotal === 0) return groups;

  const shares = groups.map((g) => ({
    rate: g.rate,
    gross: Math.round((g.gross / originalTotal) * eurTotal),
  }));
  const residual = eurTotal - sum(shares.map((g) => g.gross));

  let largest = 0;
  groups.forEach((g, i) => {
    if (Math.abs(g.gross) > Math.abs(groups[largest].gross)) largest = i;
  });
  shares[largest].gross += residual;
  return shares;
}

/**
 * One booking row per effective VAT rate, with gross amounts (including VAT)
 * so the importer doesn't need to re-calculate. Non-EUR invoices are booked
 * in EUR via `invoice.eurTotalCent`.
 */
function bookingsForInvoice(input: DatevInvoiceInput, accounts: DatevAccountMap): Booking[] {
  const { invoice, items, customerName, customerVatId } = input;
  const isKu = invoice.isKleinunternehmer;
  const isRc = invoice.isReverseCharge;
  const isCreditNote = invoice.isCreditNote;

  let groups = grossByEffectiveRate(items, isKu || isRc);
  const isForeignCurrency =
    !!invoice.currency && invoice.currency !== "EUR" && invoice.eurTotalCent != null;
  if (isForeignCurrency) {
    groups = apportionEurTotal(groups, invoice.eurTotalCent!);
  }

  const belegdatum = new Date(invoice.issueDate * 1000);
  return groups.map(({ rate, gross }) => ({
    amountCents: gross,
    debit: accounts.debitor,
    credit: revenueAccountFor(rate, isKu, isRc, accounts),
    sollHaben: isCreditNote ? "H" : "S",
    belegdatum,
    belegfeld1: invoice.number,
    buchungstext: truncate(
      `${isCreditNote ? "Storno" : "Rechnung"} ${customerName}`,
      MAX_BOOKING_TEXT_LENGTH,
    ),
    euVatId: isRc ? customerVatId : null,
  }));
}

function expenseAccountFor(
  vatRate: number,
  isReverseCharge: boolean,
  accounts: DatevAccountMap,
): number {
  if (isReverseCharge) return accounts.expenseReverseCharge;
  if (vatRate === 19) return accounts.expense19;
  if (vatRate === 7) return accounts.expense7;
  return accounts.expenseExempt;
}

type ExpenseGroup = { key: string; account: number; gross: number };

/**
 * Gross amount per (account, effective rate). An explicit
 * `expense_items.datev_account` overrides the default account of the position.
 */
function grossByAccountAndRate(
  items: ExpenseItem[],
  isReverseCharge: boolean,
  accounts: DatevAccountMap,
): ExpenseGroup[] {
  const groups = new Map<string, ExpenseGroup>();
  for (const item of items) {
    const account =
      Number.parseInt(item.datevAccount ?? "", 10) ||
      expenseAccountFor(item.vatRate, isReverseCharge, accounts);
    const rate = isReverseCharge ? 0 : item.vatRate;
    const vat = isReverseCharge ? 0 : lineVat(item);
    const key = `${account}|${rate}`;
    const group = groups.get(key) ?? { key, account, gross: 0 };
    group.gross += item.lineTotal + vat;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Eingangsrechnung → Buchungen. Soll = Aufwandskonto (passend zum USt-Satz),
 * Haben = Sammel-Kreditor. Stornierte Eingangsrechnungen drehen Soll/Haben.
 */
function bookingsForExpense(input: DatevExpenseInput, accounts: DatevAccountMap): Booking[] {
  const { expense, items, vendorName, vendorVatId } = input;
  const isRc = expense.isReverseCharge;
  const isCancelled = expense.status === "cancelled";

  const belegdatum = new Date(expense.issueDate * 1000);
  const label = isCancelled ? "Storno" : "Eingangsrechnung";
  const vendorReference = expense.number ? ` (${expense.number})` : "";
  return grossByAccountAndRate(items, isRc, accounts).map(({ account, gross }) => ({
    amountCents: gross,
    debit: account,
    credit: accounts.kreditor,
    sollHaben: isCancelled ? "H" : "S",
    belegdatum,
    belegfeld1: expense.internalNumber,
    buchungstext: truncate(`${label} ${vendorName}${vendorReference}`, MAX_BOOKING_TEXT_LENGTH),
    euVatId: isRc ? vendorVatId : null,
  }));
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

function columnIndex(header: string): number {
  return COLUMN_HEADERS.indexOf(header);
}

const COLUMN = {
  amount: columnIndex("Umsatz (ohne Soll-/Haben-Kz)"),
  sollHaben: columnIndex("Soll-/Haben-Kennzeichen"),
  currency: columnIndex("WKZ Umsatz"),
  account: columnIndex("Konto"),
  contraAccount: columnIndex("Gegenkonto (ohne BU-Schlüssel)"),
  belegdatum: columnIndex("Belegdatum"),
  belegfeld1: columnIndex("Belegfeld 1"),
  buchungstext: columnIndex("Buchungstext"),
  euVatId: columnIndex("EU-Land u. UStID (Bestimmung)"),
};

const HEADER_FORMAT_VERSION = 700;
const HEADER_DATA_CATEGORY_BOOKING_BATCH = 21;
const HEADER_BOOKING_BATCH_VERSION = 9;
const BOOKING_TYPE_FINANCIAL_ACCOUNTING = 1;
const NOT_COMMITTED = 0;

function buildHeaderLine(opts: DatevExportOpts, now: Date): string {
  // DATEV-Header für Format 700, Buchungsstapel (21).
  // Spec: https://developer.datev.de/datev/platform/en/dtvf/formate/header
  const fields: Array<string | number> = [
    quote("EXTF"),
    HEADER_FORMAT_VERSION,
    HEADER_DATA_CATEGORY_BOOKING_BATCH,
    quote("Buchungsstapel"),
    HEADER_BOOKING_BATCH_VERSION,
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
    quote(truncate(opts.bezeichnung, MAX_BATCH_LABEL_LENGTH)),
    quote(""), // Diktatkürzel
    BOOKING_TYPE_FINANCIAL_ACCOUNTING,
    0, // Rechnungslegungszweck
    NOT_COMMITTED, // Festschreibung
    quote("EUR"),
    "", "", "", "",
    "", "",
  ];
  return fields.join(";");
}

/** DATEV amounts carry no sign, so a negative booking is expressed by flipping Soll/Haben. */
function effectiveSollHaben(b: Booking): SollHaben {
  if (b.amountCents >= 0) return b.sollHaben;
  return b.sollHaben === "S" ? "H" : "S";
}

function rowFor(b: Booking): string {
  const fields: string[] = new Array(COLUMN_HEADERS.length).fill("");
  fields[COLUMN.amount] = centsToDatev(b.amountCents);
  fields[COLUMN.sollHaben] = quote(effectiveSollHaben(b));
  fields[COLUMN.currency] = quote("EUR");
  fields[COLUMN.account] = String(b.debit);
  fields[COLUMN.contraAccount] = String(b.credit);
  fields[COLUMN.belegdatum] = fmtDdmm(b.belegdatum);
  fields[COLUMN.belegfeld1] = quote(b.belegfeld1);
  fields[COLUMN.buchungstext] = quote(b.buchungstext);
  if (b.euVatId) fields[COLUMN.euVatId] = quote(b.euVatId);
  return fields.join(";");
}

export type DatevBatchInput = {
  invoices?: DatevInvoiceInput[];
  expenses?: DatevExpenseInput[];
};

/**
 * Belegdatum is exported as DDMM without a year; DATEV resolves it against the
 * Wirtschaftsjahr, so one batch must stay inside a single Wirtschaftsjahr.
 */
export function datevRangeError(
  opts: Pick<DatevExportOpts, "wjBeginn" | "dateFrom" | "dateTo">,
): string | null {
  const wjEnd = new Date(opts.wjBeginn);
  wjEnd.setFullYear(wjEnd.getFullYear() + 1);
  if (opts.dateFrom >= opts.wjBeginn && opts.dateTo < wjEnd) return null;
  return "Der Zeitraum umfasst mehr als ein Wirtschaftsjahr. Das DATEV-Belegdatum enthält kein Jahr — bitte jedes Jahr einzeln exportieren.";
}

export function buildDatevCsv(
  inputs: DatevInvoiceInput[] | DatevBatchInput,
  opts: DatevExportOpts,
  now: Date = new Date(),
): string {
  const rangeError = datevRangeError(opts);
  if (rangeError) throw new Error(rangeError);
  const batch: DatevBatchInput = Array.isArray(inputs) ? { invoices: inputs } : inputs;
  const headerLine = buildHeaderLine(opts, now);
  const columnLine = COLUMN_HEADERS.map(quote).join(";");
  const bookings = [
    ...(batch.invoices ?? []).flatMap((input) => bookingsForInvoice(input, opts.accounts)),
    ...(batch.expenses ?? []).flatMap((input) => bookingsForExpense(input, opts.accounts)),
  ];
  const lines = [headerLine, columnLine, ...bookings.map(rowFor)];
  // DATEV erwartet CRLF.
  return UTF8_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}

export function defaultDatevFilename(now: Date = new Date()): string {
  // EXTF_Buchungsstapel_YYYYMMDD_hhmm.csv — gängiges Pattern für DATEV-Importe.
  return `EXTF_Buchungsstapel_${fmtYyyymmdd(now)}_${pad2(now.getHours())}${pad2(now.getMinutes())}.csv`;
}
