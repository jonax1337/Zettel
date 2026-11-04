import type { MatchCandidate } from "$lib/bank/match";
import { openBalanceCent } from "$lib/db/invoice-lifecycle";
import { addPayment, DuplicateBankBookingError, type AddPaymentInput } from "$lib/db/invoice-payments";
import type { InvoiceListRow } from "$lib/db/invoices";
import { formatMoney } from "$lib/utils/currency";
import { formatDate, fromIsoDate } from "$lib/utils/date";
import { pluralize } from "../entity/format";
import type { ImportRow } from "./import-rows";

export const MANUAL_REASON = "Manuell zugeordnet";

const CONFIDENCE_LABEL: Record<MatchCandidate["confidence"], string> = {
  high: "Sicher",
  medium: "Wahrscheinlich",
  low: "Unsicher",
};
const MANUAL_LABEL = "Manuell";
const MISSING_DATE = "—";

export function candidateLabel(candidate: Pick<MatchCandidate, "confidence" | "reason">): string {
  return candidate.reason === MANUAL_REASON ? MANUAL_LABEL : CONFIDENCE_LABEL[candidate.confidence];
}

/** Bank statements carry ISO dates; the UI shows them the German way. */
export function formatBookingDate(isoDate: string): string {
  return isoDate ? formatDate(fromIsoDate(isoDate)) : MISSING_DATE;
}

/** Invoices a booking in this currency can still be assigned to by hand. */
export function payableInvoices(invoices: InvoiceListRow[], currency: string): InvoiceListRow[] {
  return invoices.filter(
    (invoice) =>
      (invoice.status === "sent" || invoice.status === "partial") &&
      !invoice.isCreditNote &&
      !invoice.settledByCreditNote &&
      invoice.currency.toUpperCase() === currency.toUpperCase() &&
      openBalanceCent(invoice) > 0,
  );
}

export function invoicePickerLabel(invoice: InvoiceListRow): string {
  return `${invoice.number} · ${invoice.customerName} · ${formatMoney(openBalanceCent(invoice), invoice.currency)} offen`;
}

export function manualCandidate(invoice: InvoiceListRow): MatchCandidate {
  return { invoice, confidence: "low", reason: MANUAL_REASON };
}

/** Picks `invoice` for the row, replacing an earlier manual pick, and ticks the row. */
export function assignManualInvoice(row: ImportRow, invoice: InvoiceListRow): void {
  const candidates = row.match.candidates.filter((c) => c.reason !== MANUAL_REASON);
  candidates.push(manualCandidate(invoice));
  row.match.candidates = candidates;
  row.pickedCandidate = candidates.length - 1;
  row.included = true;
}

export type ApplyOutcome =
  | { kind: "applied"; invoiceId: number; invoiceNumber: string; amountCent: number; currency: string }
  | { kind: "duplicate"; invoiceId: number; invoiceNumber: string; amountCent: number; currency: string }
  | { kind: "failed"; invoiceNumber: string; amountCent: number; currency: string; message: string };

export type BookedPayment = { invoiceId: number; invoiceNumber: string; amountCent: number; currency: string };

/** Records one booking; a booking that an earlier import already recorded is skipped, not failed. */
export async function recordBooking(payment: AddPaymentInput, booked: BookedPayment): Promise<ApplyOutcome> {
  try {
    await addPayment(payment);
    return { kind: "applied", ...booked };
  } catch (e) {
    if (e instanceof DuplicateBankBookingError) return { kind: "duplicate", ...booked };
    return { kind: "failed", ...booked, message: String(e) };
  }
}

export function summarizeOutcomes(outcomes: ApplyOutcome[]): string {
  const count = (kind: ApplyOutcome["kind"]) => outcomes.filter((o) => o.kind === kind).length;
  const applied = count("applied");
  const duplicates = count("duplicate");
  const failed = count("failed");
  const parts = [`${applied} ${pluralize(applied, "Zahlung", "Zahlungen")} gebucht`];
  if (duplicates > 0) parts.push(`${duplicates} als Duplikat übersprungen`);
  if (failed > 0) parts.push(`${failed} fehlgeschlagen`);
  return parts.join(", ");
}
