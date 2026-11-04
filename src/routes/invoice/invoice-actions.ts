import {
  canCancelInvoice,
  canCreateCreditNote as lifecycleAllowsCreditNote,
} from "$lib/db/invoice-lifecycle";
import type { Invoice } from "$lib/db/schema";

type ActionInvoice = Pick<Invoice, "status" | "isCreditNote" | "number" | "amountPaidCent" | "dueDate">;

/**
 * Payments are recorded on regular, open invoices. `settledByCreditNote` is true
 * only for an issued credit note (see `isIssuedCreditNote`): a draft one does not
 * offset the invoice yet, matching the dashboard, dunning and bank matching.
 */
export function canRecordPayments(invoice: ActionInvoice, settledByCreditNote: boolean): boolean {
  if (invoice.isCreditNote || settledByCreditNote) return false;
  return invoice.status === "sent" || invoice.status === "partial";
}

/** Settled or reversed invoices keep the card so recorded payments stay visible and correctable. */
export function showsPayments(
  invoice: ActionInvoice,
  paymentCount: number,
  settledByCreditNote: boolean,
): boolean {
  if (invoice.isCreditNote) return false;
  if (canRecordPayments(invoice, settledByCreditNote)) return true;
  const issued = invoice.status === "sent" || invoice.status === "partial" || invoice.status === "paid";
  return issued && paymentCount > 0;
}

/** `hasCreditNote` counts any credit note that is not cancelled, a draft one too. */
export function canCreateCreditNote(invoice: ActionInvoice, hasCreditNote: boolean): boolean {
  return !hasCreditNote && lifecycleAllowsCreditNote(invoice);
}

export function isOverdue(invoice: ActionInvoice, settledByCreditNote: boolean, now: number): boolean {
  return canRecordPayments(invoice, settledByCreditNote) && invoice.dueDate < now;
}

/**
 * Numbered invoices are bookkeeping records: they are reversed with a credit
 * note, never deleted or silently cancelled. Only never-issued drafts (still
 * carrying the DRAFT placeholder) can be removed.
 */
export function canDiscardInvoice(invoice: Pick<ActionInvoice, "status" | "number">): boolean {
  return canCancelInvoice(invoice);
}

/** `hasCreditNote` counts a draft credit note too: it mirrors the current items and would no longer match. */
export function canReopenAsDraft(
  invoice: ActionInvoice,
  paymentCount: number,
  hasCreditNote: boolean,
): boolean {
  if (invoice.status !== "sent" || hasCreditNote) return false;
  return paymentCount === 0 && (invoice.amountPaidCent ?? 0) === 0;
}
