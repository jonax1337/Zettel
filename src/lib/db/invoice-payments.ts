import { execute, select } from "./client";
import type { InvoicePayment, InvoicePaymentSource } from "./schema";

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

async function sumPayments(invoiceId: number): Promise<number> {
  const rows = await select<{ s: number }>(
    "SELECT COALESCE(SUM(amount_cent), 0) AS s FROM invoice_payments WHERE invoice_id = ?",
    [invoiceId],
  );
  return rows[0]?.s ?? 0;
}

/**
 * Status-Transitions ableiten:
 *   sum = 0          → status bleibt auf 'sent' (oder bleibt was es ist)
 *   0 < sum < total  → 'partial', paid_at = NULL (Restbetrag steht aus)
 *   sum >= total     → 'paid', paid_at = letzter Payment-Timestamp
 *
 * Drafts werden nicht angefasst — eine Teilzahlung auf einen Entwurf wäre ein
 * Datenkonsistenz-Fehler, den die Aufrufer (UI) verhindern müssen.
 */
async function recomputeInvoiceStatus(invoiceId: number): Promise<void> {
  const rows = await select<{
    total: number;
    status: string;
    sent_at: number | null;
  }>("SELECT total, status, sent_at FROM invoices WHERE id = ?", [invoiceId]);
  const inv = rows[0];
  if (!inv) return;
  if (inv.status === "draft" || inv.status === "cancelled") return;
  const total = Math.abs(inv.total);
  const paid = await sumPayments(invoiceId);
  // Letzten Payment-Timestamp für paid_at.
  let nextStatus: "sent" | "partial" | "paid" = "sent";
  let nextPaidAt: number | null = null;
  if (paid <= 0) {
    nextStatus = "sent";
    nextPaidAt = null;
  } else if (paid < total) {
    nextStatus = "partial";
    nextPaidAt = null;
  } else {
    nextStatus = "paid";
    const lastRows = await select<{ p: number }>(
      "SELECT MAX(paid_at) AS p FROM invoice_payments WHERE invoice_id = ?",
      [invoiceId],
    );
    nextPaidAt = lastRows[0]?.p ?? Math.floor(Date.now() / 1000);
  }
  await execute(
    `UPDATE invoices SET status = ?, amount_paid_cent = ?, paid_at = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [nextStatus, paid, nextPaidAt, invoiceId],
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
  const res = await execute(
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
  return Number(res.lastInsertId ?? 0);
}

export async function deletePayment(id: number): Promise<void> {
  const rows = await select<{ invoice_id: number }>(
    "SELECT invoice_id FROM invoice_payments WHERE id = ?",
    [id],
  );
  const invoiceId = rows[0]?.invoice_id;
  await execute("DELETE FROM invoice_payments WHERE id = ?", [id]);
  if (invoiceId) await recomputeInvoiceStatus(invoiceId);
}

export async function updatePayment(
  id: number,
  patch: { paidAt?: number; amountCent?: number; notes?: string | null },
): Promise<void> {
  const rows = await select<PaymentRow>(
    "SELECT * FROM invoice_payments WHERE id = ?",
    [id],
  );
  const existing = rows[0];
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
