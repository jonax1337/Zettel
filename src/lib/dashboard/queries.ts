import { select } from "$lib/db/client";
import { notSettledByCreditNoteSql } from "$lib/db/invoice-lifecycle";
import type { InvoiceStatus } from "$lib/db/schema";
import { nowUnix, SECONDS_PER_DAY } from "$lib/utils/date";
import { displayInvoiceNumber } from "$lib/utils/invoice-number";
import { classifyFollowUp, followUpWindow, type FollowUpGroup } from "./follow-up";
import type { Period } from "./period";
import { monthsIn } from "./period";

const REVENUE_STATUSES = `('sent','partial','paid')`;
// Credit notes never get payments and stay 'sent', and the invoice they offset
// is no longer due, so neither counts as an open receivable.
const OPEN_RECEIVABLE_SQL = `status IN ('sent','partial')
       AND (is_credit_note IS NULL OR is_credit_note = 0)
       AND ${notSettledByCreditNoteSql("invoices")}`;

// Non-EUR invoices prefer the frozen eur_total_cent, otherwise total as-is.
export const REVENUE_AMOUNT_SQL = `COALESCE(eur_total_cent, total)`;
// Net and VAT are the invoice's share of its frozen EUR total.
export const REVENUE_NET_SQL = `(CASE
  WHEN eur_total_cent IS NOT NULL AND total <> 0 THEN
    CAST(eur_total_cent * subtotal AS REAL) / total
  ELSE subtotal
END)`;
export const REVENUE_VAT_SQL = `(CASE
  WHEN eur_total_cent IS NOT NULL AND total <> 0 THEN
    CAST(eur_total_cent * vat_amount AS REAL) / total
  ELSE vat_amount
END)`;
// Offener Saldo in EUR-Cent. total und amount_paid_cent stehen in der
// Rechnungswährung, eur_total_cent ist der eingefrorene EUR-Gegenwert von total:
// der gezahlte Anteil wird daher proportional umgerechnet (Integer-Rundung
// half-up, kein Float), statt Fremdwährungs-Cent von EUR-Cent abzuziehen.
const OPEN_BALANCE_SQL = `(CASE
  WHEN eur_total_cent IS NULL OR total = 0 THEN total - COALESCE(amount_paid_cent, 0)
  ELSE eur_total_cent - (2 * eur_total_cent * COALESCE(amount_paid_cent, 0) + total) / (2 * total)
END)`;

type CountAndTotal = { count: number; total: number };

/**
 * Revenue figures count invoices issued in [period.start, period.end) with
 * status sent, partial or paid. Totals are signed, so credit notes are negative.
 */
export type Kpis = {
  revenueNet: number;
  revenueGross: number;
  expenseNet: number;
  balance: number;
  openCount: number;
  openTotal: number;
};

async function loadRevenue(p: Period): Promise<{ net: number; gross: number }> {
  const [row] = await select<{ net: number; gross: number }>(
    `SELECT
       COALESCE(SUM(${REVENUE_NET_SQL}), 0) AS net,
       COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS gross
     FROM invoices
     WHERE status IN ${REVENUE_STATUSES}
       AND issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );
  return { net: Math.round(row?.net ?? 0), gross: Math.round(row?.gross ?? 0) };
}

async function loadExpenseNet(p: Period): Promise<number> {
  const [row] = await select<{ net: number }>(
    `SELECT COALESCE(SUM(subtotal), 0) AS net
     FROM expenses
     WHERE status IN ('open','paid')
       AND issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );
  return Math.round(row?.net ?? 0);
}

async function loadOpenReceivables(p: Period): Promise<CountAndTotal> {
  const [row] = await select<{ c: number; t: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(${OPEN_BALANCE_SQL}), 0) AS t
     FROM invoices
     WHERE ${OPEN_RECEIVABLE_SQL}
       AND issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );
  return { count: row?.c ?? 0, total: row?.t ?? 0 };
}

export async function loadKpis(p: Period): Promise<Kpis> {
  const [revenue, expenseNet, open] = await Promise.all([
    loadRevenue(p),
    loadExpenseNet(p),
    loadOpenReceivables(p),
  ]);
  return {
    revenueNet: revenue.net,
    revenueGross: revenue.gross,
    expenseNet,
    balance: revenue.net - expenseNet,
    openCount: open.count,
    openTotal: open.total,
  };
}

// --- Monthly revenue within period ---

export type MonthPoint = { year: number; month: number; label: string; total: number };

export async function monthlyRevenueInPeriod(p: Period): Promise<MonthPoint[]> {
  const rows = await select<{ ym: string; t: number }>(
    `SELECT strftime('%Y-%m', issue_date, 'unixepoch', 'localtime') AS ym,
            COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS t
     FROM invoices
     WHERE status IN ${REVENUE_STATUSES}
       AND issue_date >= ? AND issue_date < ?
     GROUP BY ym`,
    [p.start, p.end],
  );
  const totalByMonthKey = new Map(rows.map((r) => [r.ym, r.t]));
  return monthsIn(p).map((m) => ({
    year: m.year,
    month: m.month,
    label: m.label,
    total: totalByMonthKey.get(`${m.year}-${String(m.month).padStart(2, "0")}`) ?? 0,
  }));
}

// --- Top customers within period ---

export type TopCustomerRow = {
  customerId: number;
  name: string;
  customerNumber: string;
  invoiceCount: number;
  total: number;
};

export async function topCustomersInPeriod(
  p: Period,
  limit: number,
): Promise<TopCustomerRow[]> {
  const rows = await select<{
    customer_id: number;
    name: string;
    customer_number: string;
    c: number;
    t: number;
  }>(
    `SELECT i.customer_id, c.name, c.customer_number,
            COUNT(*) AS c,
            COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS t
     FROM invoices i
     INNER JOIN customers c ON c.id = i.customer_id
     WHERE i.status IN ${REVENUE_STATUSES}
       AND i.issue_date >= ? AND i.issue_date < ?
     GROUP BY i.customer_id
     ORDER BY t DESC
     LIMIT ?`,
    [p.start, p.end, limit],
  );
  return rows.map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    customerNumber: r.customer_number,
    invoiceCount: r.c,
    total: r.t,
  }));
}

// --- Oldest open receivable ---

export type OldestOverdue = {
  /** Days overdue. Negative = not yet due. null = no open invoices. */
  daysOverdue: number | null;
  /** Total open (sent or partially paid) amount across all currencies, in EUR cents. */
  openTotal: number;
  /** Count of open invoices. */
  openCount: number;
};

/**
 * Single-line summary of open receivables — bucketed charts overkill at
 * freelancer scale.
 */
export async function oldestOverdue(): Promise<OldestOverdue> {
  const rows = await select<{ due_date: number; t: number }>(
    `SELECT due_date, ${OPEN_BALANCE_SQL} AS t
     FROM invoices
     WHERE ${OPEN_RECEIVABLE_SQL}`,
  );
  if (rows.length === 0) {
    return { daysOverdue: null, openTotal: 0, openCount: 0 };
  }
  const oldestDue = rows.reduce((oldest, r) => Math.min(oldest, r.due_date), rows[0].due_date);
  return {
    daysOverdue: Math.floor((nowUnix() - oldestDue) / SECONDS_PER_DAY),
    openTotal: rows.reduce((total, r) => total + r.t, 0),
    openCount: rows.length,
  };
}

// --- Wiedervorlage (follow-ups) ---

export type FollowUpItem = {
  kind: "customer" | "invoice";
  id: number;
  /** Customer name or invoice + customer */
  title: string;
  subtitle: string;
  followUpDate: number;
  /** Routing target */
  href: string;
  group: FollowUpGroup;
};

export async function loadFollowUps(): Promise<FollowUpItem[]> {
  const window = followUpWindow(new Date());

  const customers = await select<{
    id: number;
    name: string;
    customer_number: string;
    follow_up_date: number;
  }>(
    `SELECT id, name, customer_number, follow_up_date
     FROM customers
     WHERE follow_up_date IS NOT NULL AND follow_up_date < ?`,
    [window.horizonEnd],
  );

  const invoices = await select<{
    id: number;
    number: string;
    status: InvoiceStatus;
    follow_up_date: number;
    customer_name: string;
  }>(
    `SELECT i.id, i.number, i.status, i.follow_up_date, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.follow_up_date IS NOT NULL AND i.follow_up_date < ?
       AND i.status IN ('draft','sent')`,
    [window.horizonEnd],
  );

  const customerItems = customers.map((c): FollowUpItem => ({
    kind: "customer",
    id: c.id,
    title: c.name,
    subtitle: c.customer_number,
    followUpDate: c.follow_up_date,
    href: `/customers/${c.id}`,
    group: classifyFollowUp(c.follow_up_date, window),
  }));
  const invoiceItems = invoices.map((i): FollowUpItem => ({
    kind: "invoice",
    id: i.id,
    title: displayInvoiceNumber(i),
    subtitle: i.customer_name ?? "—",
    followUpDate: i.follow_up_date,
    href: `/invoices/${i.id}`,
    group: classifyFollowUp(i.follow_up_date, window),
  }));
  return [...customerItems, ...invoiceItems].sort((a, b) => a.followUpDate - b.followUpDate);
}

// --- Cash-Flow-Forecast (next 30 days) ---

const FORECAST_HORIZON_DAYS = 30;

export type CashFlowForecast = {
  /** Open `sent` invoices with due_date in [now, now + 30d]. EUR-Cent. */
  openDue: number;
  openDueCount: number;
  /** Sum of overdue `sent` invoices (due_date < now). EUR-Cent. */
  overdue: number;
  overdueCount: number;
  /** Estimated gross sum from active recurring templates with next_due_date in window. */
  recurringEstimate: number;
  recurringCount: number;
  /** Total = openDue + overdue + recurringEstimate. EUR-Cent. */
  total: number;
};

async function sumOpenBalanceWhere(dueDateCondition: string, params: number[]): Promise<CountAndTotal> {
  const [row] = await select<{ c: number; t: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(${OPEN_BALANCE_SQL}), 0) AS t
     FROM invoices
     WHERE ${OPEN_RECEIVABLE_SQL}
       AND ${dueDateCondition}`,
    params,
  );
  return { count: row?.c ?? 0, total: Math.round(row?.t ?? 0) };
}

/**
 * For each active template due within the horizon, sums line totals gross.
 * Reverse-charge templates emit 0 VAT, others get the items' VAT rate.
 */
async function estimateRecurringWithin(horizon: number): Promise<CountAndTotal> {
  const rows = await select<{ line_net: number; line_vat: number }>(
    `SELECT COALESCE(SUM(ri.quantity * ri.unit_price), 0) AS line_net,
            COALESCE(SUM(
              CASE WHEN r.is_reverse_charge = 1 THEN 0
                   ELSE ROUND(ri.quantity * ri.unit_price * ri.vat_rate / 100.0)
              END
            ), 0) AS line_vat
     FROM recurring_invoices r
     LEFT JOIN recurring_invoice_items ri ON ri.recurring_id = r.id
     WHERE r.active = 1
       AND r.next_due_date <= ?
     GROUP BY r.id`,
    [horizon],
  );
  const total = rows.reduce((sum, row) => sum + Math.round(row.line_net + row.line_vat), 0);
  return { count: rows.length, total };
}

export async function cashFlowForecast30d(): Promise<CashFlowForecast> {
  const now = nowUnix();
  const horizon = now + FORECAST_HORIZON_DAYS * SECONDS_PER_DAY;

  const [dueSoon, overdue, recurring] = await Promise.all([
    sumOpenBalanceWhere("due_date >= ? AND due_date <= ?", [now, horizon]),
    sumOpenBalanceWhere("due_date < ?", [now]),
    estimateRecurringWithin(horizon),
  ]);
  return {
    openDue: dueSoon.total,
    openDueCount: dueSoon.count,
    overdue: overdue.total,
    overdueCount: overdue.count,
    recurringEstimate: recurring.total,
    recurringCount: recurring.count,
    total: dueSoon.total + overdue.total + recurring.total,
  };
}
