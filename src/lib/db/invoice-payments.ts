import { execute, insert, select } from "./client";
import type { InvoicePayment, InvoicePaymentSource, InvoiceStatus } from "./schema";
import { nowUnix } from "$lib/utils/date";

type PaymentRow = {
  id: number;
  invoice_id: number;
  paid_at: number;
  amount_cent: number;
  eur_amount_cent: number | null;
  source: InvoicePaymentSource;
  notes: string | null;
  created_at: number;
};

function mapPayment(r: PaymentRow): InvoicePayment {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    paidAt: r.paid_at,
    amountCent: r.amount_cent,
    eurAmountCent: r.eur_amount_cent,
    source: r.source,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export async function listPayments(invoiceId: number): Promise<InvoicePayment[]> {
  const rows = await select<PaymentRow>(
    "SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY paid_at ASC, id ASC",
    [invoiceId],
  );
  return rows.map(mapPayment);
}

type PayableStatus = Extract<InvoiceStatus, "sent" | "partial" | "paid">;

/**
 * Status of a sent invoice given what has been paid so far:
 *   nothing paid        -> sent
 *   paid < total        -> partial (remainder outstanding)
 *   paid >= total       -> paid
 */
export function statusForPaidAmount(paidCent: number, totalCent: number): PayableStatus {
  if (paidCent <= 0) return "sent";
  return paidCent < totalCent ? "partial" : "paid";
}

/**
 * Re-derives status, paid amount and paid_at from the payment list. Drafts and
 * cancelled invoices are left alone; a payment on a draft would be a data
 * consistency error the calling UI has to prevent.
 */
async function recomputeInvoiceStatus(invoiceId: number): Promise<void> {
  const [invoice] = await select<{ total: number; status: InvoiceStatus }>(
    "SELECT total, status FROM invoices WHERE id = ?",
    [invoiceId],
  );
  if (!invoice || invoice.status === "draft" || invoice.status === "cancelled") return;

  const [payments] = await select<{ paid_cent: number; last_paid_at: number | null }>(
    `SELECT COALESCE(SUM(amount_cent), 0) AS paid_cent, MAX(paid_at) AS last_paid_at
     FROM invoice_payments WHERE invoice_id = ?`,
    [invoiceId],
  );
  const status = statusForPaidAmount(payments.paid_cent, Math.abs(invoice.total));
  const paidAt = status === "paid" ? (payments.last_paid_at ?? nowUnix()) : null;
  await execute(
    `UPDATE invoices SET status = ?, amount_paid_cent = ?, paid_at = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [status, payments.paid_cent, paidAt, invoiceId],
  );
}

export type AddPaymentInput = {
  invoiceId: number;
  paidAt: number;
  amountCent: number;
  source?: InvoicePaymentSource;
  notes?: string | null;
  eurAmountCent?: number | null;
};

export async function addPayment(input: AddPaymentInput): Promise<number> {
  if (input.amountCent === 0) {
    throw new Error("Zahlbetrag darf nicht 0 sein.");
  }
  const id = await insert(
    `INSERT INTO invoice_payments
       (invoice_id, paid_at, amount_cent, eur_amount_cent, source, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.invoiceId,
      input.paidAt,
      input.amountCent,
      input.eurAmountCent ?? null,
      input.source ?? "manual",
      input.notes ?? null,
    ],
  );
  await recomputeInvoiceStatus(input.invoiceId);
  return id;
}

export async function deletePayment(id: number): Promise<void> {
  const [payment] = await select<{ invoice_id: number }>(
    "SELECT invoice_id FROM invoice_payments WHERE id = ?",
    [id],
  );
  await execute("DELETE FROM invoice_payments WHERE id = ?", [id]);
  if (payment) await recomputeInvoiceStatus(payment.invoice_id);
}
