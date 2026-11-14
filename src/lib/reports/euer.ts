/**
 * Anlage EÜR: Betriebseinnahmen und -ausgaben nach dem Zufluss-/Abflussprinzip
 * (§ 11 EStG), unabhängig von der Umsatzsteuer-Einstellung. Reine Berechnung
 * ohne Datenbankzugriff; geladen wird in `euer-load.ts`.
 *
 * Eine Zahlung zählt in dem Jahr, in dem sie eingeht. Wie bei der
 * Ist-Versteuerung (`ustva-cash.ts`) wird der Anteil der Rechnung, den die
 * Zahlungen bis zum Stichtag begleichen, kumuliert berechnet: Die Jahre
 * ergeben zusammen exakt den Rechnungsbetrag, Überzahlungen bleiben außen vor.
 */
import { CSV_LINE_BREAK, escapeCsvField, UTF8_BOM } from "$lib/utils/csv";
import {
  EUER_CATEGORY_LINES,
  EUER_KZ,
  EUER_LINE_NUMBERS,
  EUER_LINES,
  formYearFor,
  type EuerLineKind,
} from "./euer-form";
import { apportion, isForeignCurrency, recognisedEurNet, type RateNet } from "./ustva-cash";

const CENTS_PER_EURO = 100;
// Float sums of payment shares can overshoot 1 by rounding noise; real overpayments are far above this.
const OVERPAYMENT_TOLERANCE = 1e-9;
const CATEGORY_KZ = new Set(EUER_CATEGORY_LINES.map((line) => line.kz));

export type EuerPayment = {
  paidAt: number;
  /** In the invoice currency; refunds on credit notes are positive. */
  amountCent: number;
  /** EUR actually received; when set it replaces the conversion via the frozen EUR total. */
  eurAmountCent: number | null;
};

export type EuerInvoice = {
  number: string;
  isCreditNote: boolean;
  isKleinunternehmer: boolean;
  reverseChargeType: "none" | "intra_eu" | "third_country";
  /** Signed gross total in the invoice currency. */
  total: number;
  currency: string | null;
  /** Signed frozen EUR gross total; only meaningful for foreign-currency invoices. */
  eurTotalCent: number | null;
  /** Net per VAT rate in the invoice currency (always positive). */
  groups: RateNet[];
  payments: EuerPayment[];
};

export type EuerExpenseItem = {
  lineTotal: number;
  /** Kennzahl of the item's category; null when it has none. */
  euerKz: string | null;
};

export type EuerExpense = {
  number: string;
  currency: string;
  isReverseCharge: boolean;
  total: number;
  vatAmount: number;
  items: EuerExpenseItem[];
};

export type EuerLine = {
  kz: string;
  /** Line number in the official form, e.g. "57" or "31–33". */
  line: string;
  label: string;
  kind: EuerLineKind;
  /** Null when no document contributes: the form wants such lines empty, not 0,00. */
  amountCent: number | null;
  hint?: string;
};

export type EuerReport = {
  year: number;
  formYear: number;
  formYearExact: boolean;
  lines: EuerLine[];
  /** Summe Betriebseinnahmen − Summe Betriebsausgaben; the form applies further corrections. */
  surplusCent: number;
  warnings: string[];
};

type Amounts = Map<string, number>;

function addTo(amounts: Amounts, kz: string, cents: number): void {
  amounts.set(kz, (amounts.get(kz) ?? 0) + cents);
}

function sumOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function shareOf(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/** Share of the invoice that the payments up to `cutoff` cover; above 1 when overpaid. */
function paidShare(invoice: EuerInvoice, cutoff: number): number {
  let paidInvoiceCurrency = 0;
  let paidEur = 0;
  for (const payment of invoice.payments) {
    if (payment.paidAt > cutoff) continue;
    if (payment.eurAmountCent === null) paidInvoiceCurrency += payment.amountCent;
    else paidEur += payment.eurAmountCent;
  }
  return shareOf(paidInvoiceCurrency, Math.abs(invoice.total)) + shareOf(paidEur, eurGrossOf(invoice));
}

/** Share of the invoice that the payments up to `cutoff` settle, 0..1. */
function settledRatio(invoice: EuerInvoice, cutoff: number): number {
  return Math.min(1, paidShare(invoice, cutoff));
}

/** The frozen EUR gross total of a foreign-currency invoice; null for invoices that are already in EUR. */
function frozenEurGross(invoice: EuerInvoice): number | null {
  const foreign = { currency: invoice.currency, eur_total_cent: invoice.eurTotalCent };
  return isForeignCurrency(foreign) ? Math.abs(foreign.eur_total_cent) : null;
}

function eurGrossOf(invoice: EuerInvoice): number {
  return frozenEurGross(invoice) ?? Math.abs(invoice.total);
}

/** Cumulative EUR net per VAT group and EUR gross of the share `ratio` (0..1) of the invoice that is settled. */
function recognised(invoice: EuerInvoice, ratio: number): { net: number[]; gross: number } {
  return {
    net: recognisedEurNet(invoice.groups, Math.abs(invoice.total), frozenEurGross(invoice), ratio),
    gross: Math.round(eurGrossOf(invoice) * ratio),
  };
}

function addInvoiceIncome(amounts: Amounts, invoice: EuerInvoice, from: number, to: number): void {
  // An invoice without a payment in the year is no income of it, however much it was paid before.
  if (!invoice.payments.some((p) => p.paidAt >= from && p.paidAt <= to)) return;
  const ratioBefore = settledRatio(invoice, from - 1);
  const ratioThrough = settledRatio(invoice, to);
  // Fully settled earlier: a further payment is an overpayment, not income of the year.
  if (ratioThrough === ratioBefore) return;
  const before = recognised(invoice, ratioBefore);
  const through = recognised(invoice, ratioThrough);
  const sign = invoice.isCreditNote ? -1 : 1;
  const net = through.net.map((n, i) => (n - before.net[i]) * sign);
  const gross = (through.gross - before.gross) * sign;

  if (invoice.isKleinunternehmer) {
    addTo(amounts, EUER_KZ.incomeKleinunternehmer, gross);
    return;
  }
  if (invoice.reverseChargeType !== "none") {
    addTo(amounts, EUER_KZ.incomeTaxFree, sumOf(net));
    return;
  }
  const taxable = invoice.groups.flatMap((g, i) => (g.rate > 0 ? [net[i]] : []));
  const taxFree = invoice.groups.flatMap((g, i) => (g.rate === 0 ? [net[i]] : []));
  if (taxable.length > 0) {
    addTo(amounts, EUER_KZ.incomeTaxable, sumOf(taxable));
    addTo(amounts, EUER_KZ.incomeVat, gross - sumOf(net));
  }
  if (taxFree.length > 0) addTo(amounts, EUER_KZ.incomeTaxFree, sumOf(taxFree));
}

/** Items without a category Kz, or with one the form does not know, count as "Übrige Betriebsausgaben". */
function kzOf(item: EuerExpenseItem): string {
  return item.euerKz !== null && CATEGORY_KZ.has(item.euerKz) ? item.euerKz : EUER_KZ.expenseOther;
}

function addExpense(amounts: Amounts, expense: EuerExpense, isKleinunternehmer: boolean): void {
  const bookGross = isKleinunternehmer && !expense.isReverseCharge;

  if (bookGross) {
    const grossShares = apportion(
      expense.items.map((item) => ({ net: item.lineTotal })),
      expense.total,
    );
    expense.items.forEach((item, i) => addTo(amounts, kzOf(item), grossShares[i]));
    return;
  }
  for (const item of expense.items) addTo(amounts, kzOf(item), item.lineTotal);
  // A § 13b purchase carries no deductible input VAT: the owed tax is deducted at once.
  const deductsInputVat = !isKleinunternehmer && !expense.isReverseCharge;
  if (deductsInputVat && expense.vatAmount !== 0) addTo(amounts, EUER_KZ.expenseInputVat, expense.vatAmount);
}

function warningAbout(
  documents: { number: string }[],
  nouns: { one: string; many: string },
  message: string,
): string[] {
  if (documents.length === 0) return [];
  const noun = documents.length === 1 ? nouns.one : nouns.many;
  return [`${documents.length} ${noun} ${message}: ${documents.map((d) => d.number).join(", ")}`];
}

const INVOICE_NOUNS = { one: "Rechnung", many: "Rechnungen" };
const EXPENSE_NOUNS = { one: "Ausgabe", many: "Ausgaben" };

function reportWarnings(input: EuerInput): string[] {
  const { invoices, expenses, to } = input;
  return [
    ...warningAbout(
      invoices.filter((i) => i.currency !== null && i.currency !== "EUR" && i.eurTotalCent === null),
      INVOICE_NOUNS,
      "in Fremdwährung ohne EUR-Wert – Beträge prüfen",
    ),
    ...warningAbout(
      invoices.filter((i) => frozenEurGross(i) === 0),
      INVOICE_NOUNS,
      "in Fremdwährung mit EUR-Wert 0 – nicht berücksichtigt",
    ),
    ...warningAbout(
      expenses.filter((e) => e.currency !== "EUR"),
      EXPENSE_NOUNS,
      "in Fremdwährung ohne EUR-Kurs – Beträge prüfen",
    ),
    ...warningAbout(
      invoices.filter((i) => paidShare(i, to) > 1 + OVERPAYMENT_TOLERANCE),
      INVOICE_NOUNS,
      "mit Überzahlung – der überschüssige Betrag ist nicht enthalten",
    ),
  ];
}

function sumLines(amounts: Amounts, kind: EuerLineKind): number | null {
  const values = EUER_LINES.filter((line) => line.kind === kind).flatMap((line) => {
    const amount = amounts.get(line.kz);
    return amount === undefined ? [] : [amount];
  });
  return values.length === 0 ? null : sumOf(values);
}

export type EuerInput = {
  year: number;
  /** Invoices with their payments up to the end of the year; only those paid in the year count. */
  invoices: EuerInvoice[];
  /** Expenses paid in the year. */
  expenses: EuerExpense[];
  /** Kleinunternehmer book expenses gross because they cannot deduct input VAT. */
  isKleinunternehmer: boolean;
  /** Unix seconds, inclusive. */
  from: number;
  to: number;
};

export function composeEuerReport(input: EuerInput): EuerReport {
  const amounts: Amounts = new Map();
  for (const invoice of input.invoices) addInvoiceIncome(amounts, invoice, input.from, input.to);
  for (const expense of input.expenses) addExpense(amounts, expense, input.isKleinunternehmer);

  const incomeSum = sumLines(amounts, "income");
  const expenseSum = sumLines(amounts, "expense");
  if (incomeSum !== null) amounts.set(EUER_KZ.incomeSum, incomeSum);
  if (expenseSum !== null) amounts.set(EUER_KZ.expenseSum, expenseSum);

  const formYear = formYearFor(input.year);
  const lineNumbers = EUER_LINE_NUMBERS[formYear.year];
  return {
    year: input.year,
    formYear: formYear.year,
    formYearExact: formYear.exact,
    lines: EUER_LINES.map((def) => ({
      kz: def.kz,
      line: lineNumbers[def.kz],
      label: def.label,
      kind: def.kind,
      amountCent: amounts.get(def.kz) ?? null,
      ...(def.hint ? { hint: def.hint } : {}),
    })),
    surplusCent: (incomeSum ?? 0) - (expenseSum ?? 0),
    warnings: reportWarnings(input),
  };
}

function centsToCsvAmount(cents: number): string {
  return (cents / CENTS_PER_EURO).toFixed(2).replace(".", ",");
}

export const EUER_SURPLUS_LABEL = "Überschuss/Fehlbetrag (Summe Betriebseinnahmen − Summe Betriebsausgaben)";

export function euerToCsv(report: EuerReport): string {
  // Excel-freundliches CSV: UTF-8-BOM, Semikolon, Komma als Dezimaltrenner.
  const lines = ["Zeile;Kz;Bezeichnung;Betrag (EUR)"];
  for (const row of report.lines) {
    const amount = row.amountCent === null ? "" : centsToCsvAmount(row.amountCent);
    lines.push(`${row.line};${row.kz};${escapeCsvField(row.label)};${amount}`);
  }
  lines.push(`;;${escapeCsvField(EUER_SURPLUS_LABEL)};${centsToCsvAmount(report.surplusCent)}`);
  return UTF8_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
