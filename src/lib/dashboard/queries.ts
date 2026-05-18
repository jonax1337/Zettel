import { select } from "$lib/db/client";
import type { Period } from "./period";
import { monthsIn, previousYearPeriod } from "./period";

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

export async function loadKpis(p: Period): Promise<Kpis> {
  const [rev] = await select<{ net: number; gross: number }>(
    `SELECT
       COALESCE(SUM(${REVENUE_NET_SQL}), 0) AS net,
       COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS gross
     FROM invoices
     WHERE status IN ('sent','paid')
       AND issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );

  const [exp] = await select<{ net: number }>(
    `SELECT COALESCE(SUM(subtotal), 0) AS net
     FROM expenses
     WHERE issue_date >= ? AND issue_date < ?`,
    [p.start, p.end],
  );

  const [open] = await select<{ c: number; t: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS t
     FROM invoices
     WHERE status = 'sent'
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

export type KpisWithYoY = Kpis & {
  prev: Kpis;
  yoy: {
    revenueNet: number | null;
    revenueGross: number | null;
    expenseNet: number | null;
    balance: number | null;
  };
};

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export async function loadKpisWithYoY(p: Period): Promise<KpisWithYoY> {
  const prevP = previousYearPeriod(p);
  const [cur, prev] = await Promise.all([loadKpis(p), loadKpis(prevP)]);
  return {
    ...cur,
    prev,
    yoy: {
      revenueNet: pct(cur.revenueNet, prev.revenueNet),
      revenueGross: pct(cur.revenueGross, prev.revenueGross),
      expenseNet: pct(cur.expenseNet, prev.expenseNet),
      balance: pct(cur.balance, prev.balance),
    },
  };
}

// --- Monthly revenue within period ---

export type MonthPoint = { year: number; month: number; label: string; total: number };

export async function monthlyRevenueInPeriod(p: Period): Promise<MonthPoint[]> {
  const rows = await select<{ ym: string; t: number }>(
    `SELECT strftime('%Y-%m', issue_date, 'unixepoch') AS ym,
            COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS t
     FROM invoices
     WHERE status IN ('sent','paid')
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
     WHERE i.status IN ('sent','paid')
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

// --- Aging buckets (open receivables) ---

export type AgingBucket = {
  label: string;
  count: number;
  total: number;
};

/**
 * Open (status=sent) invoices bucketed by days overdue, measured from
 * due_date relative to today. Negative days (not yet due) go into "0-30".
 */
export async function agingBuckets(): Promise<AgingBucket[]> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await select<{ due_date: number; t: number }>(
    `SELECT due_date, ${REVENUE_AMOUNT_SQL} AS t
     FROM invoices
     WHERE status = 'sent'`,
  );
  const buckets: AgingBucket[] = [
    { label: "0–30 Tage", count: 0, total: 0 },
    { label: "31–60 Tage", count: 0, total: 0 },
    { label: "61–90 Tage", count: 0, total: 0 },
    { label: "> 90 Tage", count: 0, total: 0 },
  ];
  for (const r of rows) {
    const days = Math.floor((now - r.due_date) / 86400);
    let idx: number;
    if (days <= 30) idx = 0;
    else if (days <= 60) idx = 1;
    else if (days <= 90) idx = 2;
    else idx = 3;
    buckets[idx].count += 1;
    buckets[idx].total += r.t;
  }
  return buckets;
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
