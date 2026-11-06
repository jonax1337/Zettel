import { periodForYear } from "$lib/dashboard/period";
import { select } from "$lib/db/client";
import { loadSettings } from "$lib/db/queries";
import { composeEuerReport, type EuerExpense, type EuerInvoice, type EuerPayment, type EuerReport } from "./euer";

type InvoiceRow = {
  id: number;
  number: string;
  is_credit_note: number;
  is_kleinunternehmer: number;
  reverse_charge_type: EuerInvoice["reverseChargeType"];
  total: number;
  currency: string | null;
  eur_total_cent: number | null;
};

type GroupRow = { invoice_id: number; vat_rate: number; net: number };

type PaymentRow = { invoice_id: number; paid_at: number; amount_cent: number; eur_amount_cent: number | null };

type ExpenseRow = {
  id: number;
  internal_number: string;
  currency: string;
  is_reverse_charge: number;
  total: number;
  vat_amount: number;
  line_total: number;
  euer_kz: string | null;
};

const PAID_IN_YEAR_SQL = `SELECT invoice_id FROM invoice_payments WHERE paid_at >= ? AND paid_at <= ?`;

function groupBy<T>(rows: T[], keyOf: (row: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

/** Invoices with a payment in [from, to], carrying all their payments up to `to`. */
async function loadInvoices(from: number, to: number): Promise<EuerInvoice[]> {
  const range = [from, to];
  const [invoices, groups, payments] = await Promise.all([
    select<InvoiceRow>(
      `SELECT id, number, is_credit_note, is_kleinunternehmer, reverse_charge_type, total, currency, eur_total_cent
       FROM invoices
       WHERE status IN ('sent','partial','paid') AND id IN (${PAID_IN_YEAR_SQL})`,
      range,
    ),
    select<GroupRow>(
      `SELECT invoice_id, vat_rate, SUM(line_total) AS net
       FROM invoice_items
       WHERE invoice_id IN (${PAID_IN_YEAR_SQL})
       GROUP BY invoice_id, vat_rate`,
      range,
    ),
    select<PaymentRow>(
      `SELECT invoice_id, paid_at, amount_cent, eur_amount_cent
       FROM invoice_payments
       WHERE paid_at <= ? AND invoice_id IN (${PAID_IN_YEAR_SQL})`,
      [to, from, to],
    ),
  ]);
  const groupsByInvoice = groupBy(groups, (g) => g.invoice_id);
  const paymentsByInvoice = groupBy(payments, (p) => p.invoice_id);

  return invoices.map((r) => ({
    number: r.number,
    isCreditNote: r.is_credit_note === 1,
    isKleinunternehmer: r.is_kleinunternehmer === 1,
    reverseChargeType: r.reverse_charge_type,
    total: r.total,
    currency: r.currency,
    eurTotalCent: r.eur_total_cent,
    groups: (groupsByInvoice.get(r.id) ?? []).map((g) => ({ rate: g.vat_rate, net: g.net })),
    payments: (paymentsByInvoice.get(r.id) ?? []).map(
      (p): EuerPayment => ({ paidAt: p.paid_at, amountCent: p.amount_cent, eurAmountCent: p.eur_amount_cent }),
    ),
  }));
}

/** Paid expenses whose payment date falls in [from, to]. */
async function loadExpenses(from: number, to: number): Promise<EuerExpense[]> {
  const rows = await select<ExpenseRow>(
    `SELECT e.id, e.internal_number, e.currency, e.is_reverse_charge, e.total, e.vat_amount,
            ii.line_total, c.euer_kz
     FROM expenses e
     JOIN expense_items ii ON ii.expense_id = e.id
     LEFT JOIN expense_categories c ON c.id = ii.category_id
     WHERE e.status = 'paid' AND e.paid_date >= ? AND e.paid_date <= ?
     ORDER BY e.id, ii.position`,
    [from, to],
  );
  return [...groupBy(rows, (r) => r.id).values()].map((itemRows) => ({
    number: itemRows[0].internal_number,
    currency: itemRows[0].currency,
    isReverseCharge: itemRows[0].is_reverse_charge === 1,
    total: itemRows[0].total,
    vatAmount: itemRows[0].vat_amount,
    items: itemRows.map((r) => ({ lineTotal: r.line_total, euerKz: r.euer_kz })),
  }));
}

export async function buildEuerReport(year: number): Promise<EuerReport> {
  const { start, end } = periodForYear(year);
  const from = start;
  const to = end - 1;
  const [settings, invoices, expenses] = await Promise.all([
    loadSettings(),
    loadInvoices(from, to),
    loadExpenses(from, to),
  ]);
  return composeEuerReport({
    year,
    invoices,
    expenses,
    isKleinunternehmer: settings.isKleinunternehmer,
    from,
    to,
  });
}
