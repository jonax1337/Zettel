import type { Invoice } from "$lib/db/schema";
import { isDraftNumber } from "$lib/utils/invoice-number";

type ActionInvoice = Pick<Invoice, "status" | "isCreditNote" | "number" | "amountPaidCent" | "dueDate">;

/** Payments only exist on regular invoices that were sent and are not settled yet. */
export function canRecordPayments(invoice: ActionInvoice): boolean {
  return !invoice.isCreditNote && (invoice.status === "sent" || invoice.status === "partial");
}

/** Settled invoices keep the card so recorded payments stay visible and correctable. */
export function showsPayments(invoice: ActionInvoice, paymentCount: number): boolean {
  if (canRecordPayments(invoice)) return true;
  return !invoice.isCreditNote && invoice.status === "paid" && paymentCount > 0;
}

export function canCreateCreditNote(invoice: ActionInvoice, cancelledByCreditNote: boolean): boolean {
  if (invoice.isCreditNote || cancelledByCreditNote) return false;
  return invoice.status === "sent" || invoice.status === "partial" || invoice.status === "paid";
}

export function isOverdue(invoice: ActionInvoice, cancelledByCreditNote: boolean, now: number): boolean {
  return canRecordPayments(invoice) && !cancelledByCreditNote && invoice.dueDate < now;
}

/**
 * Numbered invoices are bookkeeping records: they are reversed with a credit
 * note, never deleted or silently cancelled. Only never-issued drafts (still
 * carrying the DRAFT placeholder) can be removed.
 */
export function canDiscardInvoice(invoice: Pick<ActionInvoice, "status" | "number">): boolean {
  return invoice.status === "draft" && isDraftNumber(invoice.number);
}

export function canReopenAsDraft(
  invoice: ActionInvoice,
  paymentCount: number,
  cancelledByCreditNote: boolean,
): boolean {
  if (invoice.status !== "sent" || cancelledByCreditNote) return false;
  return paymentCount === 0 && (invoice.amountPaidCent ?? 0) === 0;
}
