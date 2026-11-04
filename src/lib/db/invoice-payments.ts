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
  bank_transaction_id: string | null;
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
    bankTransactionId: r.bank_transaction_id,
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
  /** Dedupe key of an imported bank booking (see `bankBookingKey`); null for manual payments. */
  bankTransactionId?: string | null;
  /** Accept more than the open amount, e.g. a customer who paid twice. */
  allowOverpayment?: boolean;
};

/** Thrown when a bank booking was already recorded, e.g. the same statement imported twice. */
export class DuplicateBankBookingError extends Error {
  constructor() {
    super("Diese Buchung wurde bereits importiert.");
    this.name = "DuplicateBankBookingError";
  }
}

export type PayableInvoice = { status: InvoiceStatus; total: number; paidCent: number };

/** Why a payment cannot be recorded against this invoice, or null when it can. */
export function paymentRejection(
  invoice: PayableInvoice,
  amountCent: number,
  allowOverpayment = false,
): string | null {
  if (invoice.status !== "sent" && invoice.status !== "partial") {
    return "Zahlungen können nur für versendete oder teilbezahlte Rechnungen erfasst werden.";
  }
  if (!Number.isInteger(amountCent) || amountCent <= 0) {
    return "Zahlbetrag muss größer als 0 sein.";
  }
  const openCent = Math.abs(invoice.total) - invoice.paidCent;
  if (!allowOverpayment && amountCent > openCent) {
    return "Der Zahlbetrag übersteigt den offenen Betrag der Rechnung.";
  }
  return null;
}

async function loadPayableInvoice(invoiceId: number): Promise<PayableInvoice | null> {
  const [row] = await select<{ status: InvoiceStatus; total: number; paid_cent: number }>(
    `SELECT i.status, i.total,
            (SELECT COALESCE(SUM(p.amount_cent), 0) FROM invoice_payments p WHERE p.invoice_id = i.id) AS paid_cent
     FROM invoices i WHERE i.id = ?`,
    [invoiceId],
  );
  return row ? { status: row.status, total: row.total, paidCent: row.paid_cent } : null;
}

async function isBankBookingRecorded(bankTransactionId: string): Promise<boolean> {
  const rows = await select<{ id: number }>(
    "SELECT id FROM invoice_payments WHERE bank_transaction_id = ? LIMIT 1",
    [bankTransactionId],
  );
  return rows.length > 0;
}

/**
 * Validates before writing and removes the payment row again if the invoice
 * cannot be updated, so a failed booking never leaves a payment behind that
 * the next import would book a second time.
 */
export async function addPayment(input: AddPaymentInput): Promise<number> {
  const invoice = await loadPayableInvoice(input.invoiceId);
  if (!invoice) throw new Error(`Rechnung ${input.invoiceId} nicht gefunden.`);
  const rejection = paymentRejection(invoice, input.amountCent, input.allowOverpayment);
  if (rejection) throw new Error(rejection);
  const bankTransactionId = input.bankTransactionId ?? null;
  if (bankTransactionId !== null && (await isBankBookingRecorded(bankTransactionId))) {
    throw new DuplicateBankBookingError();
  }

  const id = await insert(
    `INSERT INTO invoice_payments
       (invoice_id, paid_at, amount_cent, eur_amount_cent, source, notes, bank_transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.invoiceId,
      input.paidAt,
      input.amountCent,
      input.eurAmountCent ?? null,
      input.source ?? "manual",
      input.notes ?? null,
      bankTransactionId,
    ],
  );
  try {
    await recomputeInvoiceStatus(input.invoiceId);
  } catch (error) {
    await execute("DELETE FROM invoice_payments WHERE id = ?", [id]);
    throw error;
  }
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

export async function updatePayment(
  id: number,
  patch: { paidAt?: number; amountCent?: number; notes?: string | null },
): Promise<void> {
  const [existing] = await select<PaymentRow>(
    "SELECT * FROM invoice_payments WHERE id = ?",
    [id],
  );
  if (!existing) return;
  await execute(
    `UPDATE invoice_payments
       SET paid_at = ?, amount_cent = ?, notes = ?
     WHERE id = ?`,
    [
      patch.paidAt ?? existing.paid_at,
      patch.amountCent ?? existing.amount_cent,
      patch.notes !== undefined ? patch.notes : existing.notes,
      id,
    ],
  );
  await recomputeInvoiceStatus(existing.invoice_id);
}
