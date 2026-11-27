import { select } from "$lib/db/client";
import { nowUnix, SECONDS_PER_DAY } from "$lib/utils/date";
import { bucketByAge, type AgeBucket, type OpenInvoiceRow } from "./age-buckets";
import { monthKey, monthsIn, type Period } from "./period";
import {
  EXPENSE_STATUSES,
  FORECAST_HORIZON_DAYS,
  openInvoiceRows,
  recurringEstimates,
  REVENUE_AMOUNT_SQL,
} from "./queries";
import { bucketExpectedPayments, type ExpectedPayments } from "./weeks";

export type MonthAmount = { year: number; month: number; label: string; amount: number };

/** Net expenses per month of the period, counted like the expense KPI. */
export async function monthlyExpensesNet(p: Period): Promise<MonthAmount[]> {
  const rows = await select<{ ym: string; n: number }>(
    `SELECT strftime('%Y-%m', issue_date, 'unixepoch', 'localtime') AS ym,
            COALESCE(SUM(subtotal), 0) AS n
     FROM expenses
     WHERE status IN ${EXPENSE_STATUSES}
       AND issue_date >= ? AND issue_date < ?
     GROUP BY ym`,
    [p.start, p.end],
  );
  const netByMonthKey = new Map(rows.map((r) => [r.ym, r.n]));
  return monthsIn(p).map((m) => ({
    year: m.year,
    month: m.month,
    label: m.label,
    amount: Math.round(netByMonthKey.get(monthKey(m)) ?? 0),
  }));
}

/** Open receivables split by how long they have been due. Pass `openInvoices` to reuse rows already loaded. */
export async function receivablesByAge(
  now: number = nowUnix(),
  openInvoices?: OpenInvoiceRow[],
): Promise<AgeBucket[]> {
  return bucketByAge(openInvoices ?? (await openInvoiceRows()), now);
}

/**
 * Money expected in the next 30 days: overdue first, then per calendar week.
 * Pass `openInvoices` to reuse rows already loaded.
 */
export async function expectedPaymentsByWeek(
  now: number = nowUnix(),
  openInvoices?: OpenInvoiceRow[],
): Promise<ExpectedPayments> {
  const horizon = now + FORECAST_HORIZON_DAYS * SECONDS_PER_DAY;
  const [rows, estimates] = await Promise.all([
    openInvoices ?? openInvoiceRows(),
    recurringEstimates(horizon),
  ]);
  return bucketExpectedPayments(now, horizon, rows, estimates);
}

export type DraftSummary = {
  count: number;
  /** EUR cents of the drafts that have a EUR value. */
  total: number;
  /** Foreign-currency drafts without an exchange rate, left out of `total`. */
  unconvertedCount: number;
};

export async function draftInvoiceSummary(): Promise<DraftSummary> {
  const [row] = await select<{ c: number; t: number; u: number }>(
    `SELECT COUNT(*) AS c,
            COALESCE(SUM(CASE WHEN eur_total_cent IS NOT NULL OR currency = 'EUR' THEN ${REVENUE_AMOUNT_SQL} END), 0) AS t,
            COALESCE(SUM(CASE WHEN eur_total_cent IS NULL AND currency <> 'EUR' THEN 1 ELSE 0 END), 0) AS u
     FROM invoices
     WHERE status = 'draft'`,
  );
  return { count: row?.c ?? 0, total: Math.round(row?.t ?? 0), unconvertedCount: row?.u ?? 0 };
}
