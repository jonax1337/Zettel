import { openBalanceCent } from "$lib/db/invoice-lifecycle";
import type { InvoiceListRow } from "$lib/db/invoices";
import type { OfferListRow } from "$lib/db/offers";
import type { ExpenseListRow } from "$lib/db/expenses";
import { formatMoney } from "$lib/utils/currency";
import { canRecordPayments, isOverdue } from "../../invoice/invoice-actions";
import { pluralize } from "../entity/format";

/** One entry of the line under a table: plain text, or a label with a figure. */
export type SummarySegment = { label: string; value?: string };

type MoneyAmount = { currency: string; cents: number };

/** Amounts of different currencies are never added together; each currency keeps its own sum. */
export function sumByCurrency(amounts: MoneyAmount[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const { currency, cents } of amounts) {
    totals.set(currency, (totals.get(currency) ?? 0) + cents);
  }
  return totals;
}

export function formatTotals(totals: Map<string, number>): string {
  if (totals.size === 0) return formatMoney(0, "EUR");
  return [...totals]
    .sort(([a], [b]) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)))
    .map(([currency, cents]) => formatMoney(cents, currency))
    .join(" + ");
}

const money = (amounts: MoneyAmount[]) => formatTotals(sumByCurrency(amounts));

const count = (n: number, singular: string, plural: string) => `${n} ${pluralize(n, singular, plural)}`;

export type InvoiceSummaryRow = Pick<
  InvoiceListRow,
  | "status"
  | "isCreditNote"
  | "number"
  | "amountPaidCent"
  | "dueDate"
  | "total"
  | "currency"
  | "creditedCent"
  | "settledByCreditNote"
>;

function openAndOverdueTotals(rows: InvoiceSummaryRow[], now: number) {
  const open = rows.filter((r) => canRecordPayments(r, r.settledByCreditNote));
  const overdue = open.filter((r) => isOverdue(r, r.settledByCreditNote, now));
  const balance = (r: InvoiceSummaryRow): MoneyAmount => ({ currency: r.currency, cents: openBalanceCent(r) });
  return { open: money(open.map(balance)), overdue: overdue.length > 0 ? money(overdue.map(balance)) : null };
}

const invoiceCount = (rows: unknown[]): SummarySegment => ({ label: count(rows.length, "Rechnung", "Rechnungen") });

/** Sum of the shown invoices (credit notes carry a negative total and net out) and what is still open on them. */
export function invoiceSummary(rows: InvoiceSummaryRow[], now: number): SummarySegment[] {
  const { open, overdue } = openAndOverdueTotals(rows, now);
  const segments: SummarySegment[] = [
    invoiceCount(rows),
    { label: "Summe", value: money(rows.map((r) => ({ currency: r.currency, cents: r.total }))) },
    { label: "davon offen", value: open },
  ];
  if (overdue) segments.push({ label: "davon überfällig", value: overdue });
  return segments;
}

/** On the "Offen" view every row is open, so the sum would repeat the open amount: show that once. */
export function openInvoiceSummary(rows: InvoiceSummaryRow[], now: number): SummarySegment[] {
  const { open, overdue } = openAndOverdueTotals(rows, now);
  const segments: SummarySegment[] = [invoiceCount(rows), { label: "offen", value: open }];
  if (overdue) segments.push({ label: "davon überfällig", value: overdue });
  return segments;
}

export type OfferSummaryRow = Pick<OfferListRow, "status" | "total" | "currency">;

/** An offer counts as open while it waits for the customer's answer. */
export function offerSummary(rows: OfferSummaryRow[]): SummarySegment[] {
  const amount = (r: OfferSummaryRow): MoneyAmount => ({ currency: r.currency, cents: r.total });
  return [
    { label: count(rows.length, "Angebot", "Angebote") },
    { label: "Summe", value: money(rows.map(amount)) },
    { label: "offen", value: money(rows.filter((r) => r.status === "sent").map(amount)) },
  ];
}

export type ExpenseSummaryRow = Pick<ExpenseListRow, "status" | "total">;

export function expenseSummary(rows: ExpenseSummaryRow[]): SummarySegment[] {
  const amount = (r: ExpenseSummaryRow): MoneyAmount => ({ currency: "EUR", cents: r.total });
  return [
    { label: count(rows.length, "Ausgabe", "Ausgaben") },
    { label: "Summe", value: money(rows.map(amount)) },
    { label: "offen", value: money(rows.filter((r) => r.status === "open").map(amount)) },
  ];
}

export type ReminderSummaryRow = { totalDueCents: number; currency: string };

export function reminderSummary(rows: ReminderSummaryRow[]): SummarySegment[] {
  return [
    { label: count(rows.length, "Mahnung", "Mahnungen") },
    { label: "zu zahlen", value: money(rows.map((r) => ({ currency: r.currency, cents: r.totalDueCents }))) },
  ];
}

export function countSummary(n: number, singular: string, plural: string): SummarySegment[] {
  return [{ label: count(n, singular, plural) }];
}
