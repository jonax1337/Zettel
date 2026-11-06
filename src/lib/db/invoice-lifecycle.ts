/**
 * GoBD rules for what may still happen to an invoice. Pure, so the UI can ask
 * the same questions the DB layer enforces.
 */
import type { Invoice } from "./schema";
import { isDraftNumber } from "$lib/utils/invoice-number";

type LifecycleFacts = Pick<Invoice, "number" | "status">;

/** A bank booking may miss the open balance by a rounding cent; matching and payment validation both accept it. */
export const PAYMENT_ROUNDING_TOLERANCE_CENT = 1;

/** Only invoices that never received a real number leave no gap when deleted. */
export function canDeleteInvoice(invoice: LifecycleFacts): boolean {
  return isDraftNumber(invoice.number);
}

/** Numbered invoices are cancelled with a credit note; only unnumbered drafts can be discarded. */
export function canCancelInvoice(invoice: LifecycleFacts): boolean {
  return invoice.status === "draft" && isDraftNumber(invoice.number);
}

/**
 * Whether the editor keeps the line totals an invoice draft was saved with. A credit
 * note mirrors its original, and an invoice that already carries a real number was
 * issued once (it is a reopened draft); both keep their amounts as long as a position
 * stays as it is. Only a draft that never got a number is computed anew.
 */
export function keepsStoredAmounts(invoice: Pick<Invoice, "number" | "isCreditNote">): boolean {
  return invoice.isCreditNote || !isDraftNumber(invoice.number);
}

/**
 * A sent invoice may go back to draft (keeping its number) as long as nothing
 * has been booked against it. A discarded draft stays discarded: discarding
 * frees its time entries for other invoices. Any credit note that is not
 * cancelled blocks it, a draft one too: it mirrors the invoice's current items
 * and would no longer match after an edit.
 */
export function canReopenInvoice(
  invoice: LifecycleFacts,
  facts: { paymentCount: number; hasCreditNote: boolean },
): boolean {
  return invoice.status === "sent" && facts.paymentCount === 0 && !facts.hasCreditNote;
}

export function canCreateCreditNote(invoice: Pick<Invoice, "status" | "isCreditNote">): boolean {
  return (
    !invoice.isCreditNote &&
    (invoice.status === "sent" || invoice.status === "partial" || invoice.status === "paid")
  );
}

type CreditNoteFacts = Pick<Invoice, "isCreditNote" | "status">;

export function isIssuedCreditNote(invoice: CreditNoteFacts): boolean {
  return invoice.isCreditNote && invoice.status !== "draft" && invoice.status !== "cancelled";
}

/** What a credit note takes off its original: nothing until it is issued. Credit note totals are negative. */
export function creditedCentOf(creditNote: (CreditNoteFacts & Pick<Invoice, "total">) | null): number {
  return creditNote && isIssuedCreditNote(creditNote) ? Math.abs(creditNote.total) : 0;
}

/**
 * The amounts that decide whether an invoice is still due, all in the invoice's
 * currency. `creditedCent` is the absolute sum of its issued credit notes.
 */
export type SettlementFacts = Pick<Invoice, "total" | "amountPaidCent"> & { creditedCent: number };

/** What the customer still owes; negative when payments and credit notes exceed the total. */
export function openBalanceCent(invoice: SettlementFacts): number {
  return Math.abs(invoice.total) - invoice.amountPaidCent - invoice.creditedCent;
}

/**
 * Settled by credit notes once issued credit notes, together with the payments,
 * leave nothing open. Such an invoice keeps its own status (KPIs net out invoice
 * and credit note) but is no longer due: not dunnable, not overdue, not matched
 * against bank bookings. A partial credit note leaves the remainder due.
 */
export function isSettledByCreditNote(invoice: SettlementFacts): boolean {
  return invoice.creditedCent > 0 && openBalanceCent(invoice) <= 0;
}

/**
 * The only payment of a paid invoice stays, or the invoice would silently turn
 * unpaid. When credit notes settle the invoice, "paid" does not mean cash was
 * received, so a payment booked by mistake must still be removable.
 */
export function canRemovePayment(
  invoice: SettlementFacts & Pick<Invoice, "status">,
  paymentCount: number,
): boolean {
  return invoice.status !== "paid" || paymentCount > 1 || isSettledByCreditNote(invoice);
}

export const SETTLED_BY_CREDIT_NOTE_ERROR =
  "Die Rechnung ist durch eine Stornorechnung ausgeglichen. Zahlungen können nicht mehr erfasst werden.";

/**
 * SQL mirror of `creditedCent` for the invoice aliased `alias`. Only credit notes in the
 * invoice's own currency count: amounts of different currencies cannot be summed.
 */
export function creditedCentSql(alias: string): string {
  return `(SELECT ABS(COALESCE(SUM(credit_note.total), 0)) FROM invoices credit_note
     WHERE credit_note.corrects_invoice_id = ${alias}.id
       AND credit_note.is_credit_note = 1
       AND credit_note.currency = ${alias}.currency
       AND credit_note.status NOT IN ('draft','cancelled'))`;
}

/** SQL mirror of {@link openBalanceCent}, from the cached paid amount. */
function openBalanceSql(alias: string): string {
  return `(ABS(${alias}.total) - COALESCE(${alias}.amount_paid_cent, 0) - ${creditedCentSql(alias)})`;
}

/** SQL mirror of {@link isSettledByCreditNote} for the invoice aliased `alias`. */
export function settledByCreditNoteSql(alias: string): string {
  return `(${creditedCentSql(alias)} > 0 AND ${openBalanceSql(alias)} <= 0)`;
}

export function notSettledByCreditNoteSql(alias: string): string {
  return `NOT ${settledByCreditNoteSql(alias)}`;
}

/**
 * SQL for an issued invoice whose issued credit notes (same currency) cover its whole
 * total, for the invoice aliased `alias`. Nothing of it is owed or deliverable any more,
 * so what was billed on it may be billed again. A partial credit note does not qualify.
 */
export function fullyReversedSql(alias: string): string {
  const credited = creditedCentSql(alias);
  return `(${alias}.is_credit_note = 0 AND ${alias}.status NOT IN ('draft','cancelled')
     AND ${credited} > 0 AND ${credited} >= ABS(${alias}.total))`;
}
