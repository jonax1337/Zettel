/**
 * GoBD rules for what may still happen to an invoice. Pure, so the UI can ask
 * the same questions the DB layer enforces.
 */
import type { Invoice } from "./schema";
import { isDraftNumber } from "$lib/utils/invoice-number";

type LifecycleFacts = Pick<Invoice, "number" | "status">;

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
 * has been booked against it; a discarded draft may be picked up again.
 */
export function canReopenInvoice(
  invoice: LifecycleFacts,
  facts: { paymentCount: number; hasIssuedCreditNote: boolean },
): boolean {
  if (invoice.status === "cancelled") return isDraftNumber(invoice.number);
  return invoice.status === "sent" && facts.paymentCount === 0 && !facts.hasIssuedCreditNote;
}

export function canCreateCreditNote(invoice: Pick<Invoice, "status" | "isCreditNote">): boolean {
  return (
    !invoice.isCreditNote &&
    (invoice.status === "sent" || invoice.status === "partial" || invoice.status === "paid")
  );
}

type CreditNoteFacts = Pick<Invoice, "isCreditNote" | "status" | "correctsInvoiceId">;

export function isIssuedCreditNote(invoice: CreditNoteFacts): boolean {
  return invoice.isCreditNote && invoice.status !== "draft" && invoice.status !== "cancelled";
}

/**
 * Invoices offset by an issued credit note. They keep their own status (KPIs
 * net out invoice and credit note) but are no longer due: not dunnable, not
 * overdue, not matched against bank bookings.
 */
export function invoiceIdsSettledByCreditNote(invoices: CreditNoteFacts[]): Set<number> {
  const ids = new Set<number>();
  for (const invoice of invoices) {
    if (isIssuedCreditNote(invoice) && invoice.correctsInvoiceId != null) {
      ids.add(invoice.correctsInvoiceId);
    }
  }
  return ids;
}

/** SQL condition mirroring {@link invoiceIdsSettledByCreditNote} for the invoice aliased `alias`. */
export function notSettledByCreditNoteSql(alias: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM invoices credit_note
     WHERE credit_note.corrects_invoice_id = ${alias}.id
       AND credit_note.is_credit_note = 1
       AND credit_note.status NOT IN ('draft','cancelled'))`;
}
