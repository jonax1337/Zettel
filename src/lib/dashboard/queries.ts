import { select } from "$lib/db/client";
import type { Period } from "./period";
import { monthsIn } from "./period";

/**
 * Revenue figure: invoices issued in [period.start, period.end), status sent or
 * paid, signed totals (credit notes are negative). Non-EUR invoices prefer
 * eur_total_cent if set, otherwise total_cent as-is.
 */
export type Kpis = {
  revenueNet: number;
  revenueGross: number;
  expenseNet: number;
  balance: number;
  openCount: number;
  openTotal: number;
};

const REVENUE_AMOUNT_SQL = `COALESCE(eur_total_cent, total)`;
const REVENUE_NET_SQL = `(CASE
  WHEN eur_total_cent IS NOT NULL AND total <> 0 THEN
    CAST(eur_total_cent * subtotal AS REAL) / total
  ELSE subtotal
END)`;
// Offener Saldo = Brutto-Total − bereits gezahlt. Bei Multi-Currency-Rechnungen
// stehen total und amount_paid_cent in der Rechnungswährung — die Differenz ist
// dieselbe Einheit. Wir zeigen also den Rest in Originalwährung; bei einer
// gemischten Liste bleibt das eine Approximation (so wie REVENUE_AMOUNT_SQL).
const OPEN_BALANCE_SQL = `(COALESCE(eur_total_cent, total) - COALESCE(amount_paid_cent, 0))`;

export async function loadKpis(p: Period): Promise<Kpis> {
  const [rev] = await select<{ net: number; gross: number }>(
    `SELECT
       COALESCE(SUM(${REVENUE_NET_SQL}), 0) AS net,
       COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS gross
     FROM invoices
     WHERE status IN ('sent','partial','paid')
       AND issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );

  const [exp] = await select<{ net: number }>(
    `SELECT COALESCE(SUM(subtotal), 0) AS net
     FROM expenses
     WHERE status IN ('open','paid')
       AND issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );

  const [open] = await select<{ c: number; t: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(${OPEN_BALANCE_SQL}), 0) AS t
     FROM invoices
     WHERE status IN ('sent','partial')
       AND issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );

  const net = Math.round(rev?.net ?? 0);
  const gross = Math.round(rev?.gross ?? 0);
  const expNet = Math.round(exp?.net ?? 0);
  return {
    revenueNet: net,
    revenueGross: gross,
    expenseNet: expNet,
    balance: net - expNet,
    openCount: open?.c ?? 0,
    openTotal: open?.t ?? 0,
  };
}

// --- Monthly revenue within period ---

export type MonthPoint = { year: number; month: number; label: string; total: number };

export async function monthlyRevenueInPeriod(p: Period): Promise<MonthPoint[]> {
  const rows = await select<{ ym: string; t: number }>(
    `SELECT strftime('%Y-%m', issue_date, 'unixepoch') AS ym,
            COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS t
     FROM invoices
     WHERE status IN ('sent','partial','paid')
       AND issue_date >= ? AND issue_date < ?
     GROUP BY ym`,
    [p.start, p.end],
  );
  const byKey = new Map(rows.map((r) => [r.ym, r.t]));
  return monthsIn(p).map((m) => ({
    year: m.year,
    month: m.month,
    label: m.label,
    total: byKey.get(`${m.year}-${String(m.month).padStart(2, "0")}`) ?? 0,
  }));
}

// --- Top 5 customers within period ---

export type TopCustomerRow = {
  customerId: number;
  name: string;
  customerNumber: string;
  invoiceCount: number;
  total: number;
};

export async function topCustomersInPeriod(
  p: Period,
  limit = 5,
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
     WHERE i.status IN ('sent','partial','paid')
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
  /** Total open (sent, not paid) amount across all currencies, in EUR cents. */
  openTotal: number;
  /** Count of open invoices. */
  openCount: number;
};

/**
 * Single-line summary of open receivables — bucketed charts overkill at
 * freelancer scale.
 */
export async function oldestOverdue(): Promise<OldestOverdue> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await select<{ due_date: number; t: number }>(
    `SELECT due_date, ${OPEN_BALANCE_SQL} AS t
     FROM invoices
     WHERE status IN ('sent','partial')`,
  );
  if (rows.length === 0) {
    return { daysOverdue: null, openTotal: 0, openCount: 0 };
  }
  let openTotal = 0;
  let oldestDue = rows[0].due_date;
  for (const r of rows) {
    openTotal += r.t;
    if (r.due_date < oldestDue) oldestDue = r.due_date;
  }
  return {
    daysOverdue: Math.floor((now - oldestDue) / 86400),
    openTotal,
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
  group: "overdue" | "today" | "week";
};

export async function loadFollowUps(): Promise<FollowUpItem[]> {
  const now = new Date();
  const today0 = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  const todayEnd = today0 + 86400;
  const weekEnd = today0 + 8 * 86400;

  const customers = await select<{
    id: number;
    name: string;
    customer_number: string;
    follow_up_date: number;
  }>(
    `SELECT id, name, customer_number, follow_up_date
     FROM customers
     WHERE follow_up_date IS NOT NULL AND follow_up_date < ?`,
    [weekEnd],
  );

  const invoices = await select<{
    id: number;
    number: string;
    follow_up_date: number;
    customer_name: string;
  }>(
    `SELECT i.id, i.number, i.follow_up_date, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.follow_up_date IS NOT NULL AND i.follow_up_date < ?
       AND i.status IN ('draft','sent')`,
    [weekEnd],
  );

  const items: FollowUpItem[] = [];
  for (const c of customers) {
    items.push({
      kind: "customer",
      id: c.id,
      title: c.name,
      subtitle: c.customer_number,
      followUpDate: c.follow_up_date,
      href: `/customers/${c.id}`,
      group:
        c.follow_up_date < today0
          ? "overdue"
          : c.follow_up_date < todayEnd
            ? "today"
            : "week",
    });
  }
  for (const i of invoices) {
    items.push({
      kind: "invoice",
      id: i.id,
      title: i.number.startsWith("DRAFT-") ? `Entwurf #${i.number.slice(6, 10)}` : i.number,
      subtitle: i.customer_name ?? "—",
      followUpDate: i.follow_up_date,
      href: `/invoices/${i.id}`,
      group:
        i.follow_up_date < today0
          ? "overdue"
          : i.follow_up_date < todayEnd
            ? "today"
            : "week",
    });
  }
  items.sort((a, b) => a.followUpDate - b.followUpDate);
  return items;
}

// --- Cash-Flow-Forecast (next 30 days) ---

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

export async function cashFlowForecast30d(): Promise<CashFlowForecast> {
  const now = Math.floor(Date.now() / 1000);
  const horizon = now + 30 * 86400;

  const [open] = await select<{ c: number; t: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(${OPEN_BALANCE_SQL}), 0) AS t
     FROM invoices
     WHERE status IN ('sent','partial')
       AND due_date >= ? AND due_date <= ?`,
    [now, horizon],
  );

  const [over] = await select<{ c: number; t: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(${OPEN_BALANCE_SQL}), 0) AS t
     FROM invoices
     WHERE status IN ('sent','partial')
       AND due_date < ?`,
    [now],
  );

  // Recurring estimate: for each active template due in window, sum line totals
  // gross. Reverse-charge templates emit 0 VAT, others get the items' VAT-rate.
  const recurringRows = await select<{
    id: number;
    is_reverse_charge: number;
    line_net: number;
    line_vat: number;
  }>(
    `SELECT r.id,
            r.is_reverse_charge,
            COALESCE(SUM(ri.quantity * ri.unit_price), 0) AS line_net,
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
  let recurringEstimate = 0;
  for (const row of recurringRows) {
    recurringEstimate += Math.round(row.line_net + row.line_vat);
  }
  const recurringCount = recurringRows.length;

  const openDue = Math.round(open?.t ?? 0);
  const openDueCount = open?.c ?? 0;
  const overdue = Math.round(over?.t ?? 0);
  const overdueCount = over?.c ?? 0;
  return {
    openDue,
    openDueCount,
    overdue,
    overdueCount,
    recurringEstimate,
    recurringCount,
    total: openDue + overdue + recurringEstimate,
  };
}
