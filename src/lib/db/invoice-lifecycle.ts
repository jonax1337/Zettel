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
 * A sent invoice may go back to draft (keeping its number) as long as nothing
 * has been booked against it; a discarded draft may be picked up again. Any
 * credit note that is not cancelled blocks it, a draft one too: it mirrors the
 * invoice's current items and would no longer match after an edit.
 */
export function canReopenInvoice(
  invoice: LifecycleFacts,
  facts: { paymentCount: number; hasCreditNote: boolean },
): boolean {
  if (invoice.status === "cancelled") return isDraftNumber(invoice.number);
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

export const SETTLED_BY_CREDIT_NOTE_ERROR =
  "Die Rechnung ist durch eine Stornorechnung ausgeglichen. Zahlungen können nicht mehr erfasst werden.";

/** SQL mirror of `creditedCent` for the invoice aliased `alias`. */
export function creditedCentSql(alias: string): string {
  return `(SELECT ABS(COALESCE(SUM(credit_note.total), 0)) FROM invoices credit_note
     WHERE credit_note.corrects_invoice_id = ${alias}.id
       AND credit_note.is_credit_note = 1
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
