import {
  OPEN_BALANCE_SQL,
  OPEN_RECEIVABLE_SQL,
  REVENUE_NET_SQL,
  REVENUE_STATUSES,
} from "$lib/dashboard/queries";
import type { Period } from "$lib/dashboard/period";
import { computeLineTotal } from "$lib/utils/totals";
import { select } from "./client";
import type { RecurringInterval } from "./schema";

/**
 * What a customer's invoices add up to, in EUR cents. The sums use the overview's
 * definitions (REVENUE_NET_SQL, OPEN_RECEIVABLE_SQL, OPEN_BALANCE_SQL), so a foreign-currency
 * invoice counts with its frozen EUR amount and amounts of different currencies are never added.
 */
export type InvoiceFigures = {
  /** Net revenue of invoices issued within the period; credit notes count negative. */
  revenueNet: number;
  /** What is still owed on sent and partially paid invoices, whatever their issue date. */
  openBalance: number;
  openCount: number;
  /** Issue date of the newest issued invoice (credit notes excluded). */
  lastInvoiceDate: number | null;
};

export const EMPTY_INVOICE_FIGURES: InvoiceFigures = {
  revenueNet: 0,
  openBalance: 0,
  openCount: 0,
  lastInvoiceDate: null,
};

type FigureRow = {
  customer_id: number;
  revenue_net: number;
  open_balance: number;
  open_count: number;
  last_invoice_date: number | null;
};

async function selectInvoiceFigures(period: Period, customerId?: number): Promise<Map<number, InvoiceFigures>> {
  // Unaliased on purpose: the shared SQL fragments address the table as "invoices".
  const rows = await select<FigureRow>(
    `SELECT customer_id,
            COALESCE(SUM(CASE WHEN status IN ${REVENUE_STATUSES} AND issue_date >= ? AND issue_date < ?
                              THEN ${REVENUE_NET_SQL} END), 0) AS revenue_net,
            COALESCE(SUM(CASE WHEN ${OPEN_RECEIVABLE_SQL} THEN ${OPEN_BALANCE_SQL} END), 0) AS open_balance,
            COALESCE(SUM(CASE WHEN ${OPEN_RECEIVABLE_SQL} THEN 1 END), 0) AS open_count,
            MAX(CASE WHEN status IN ${REVENUE_STATUSES} AND is_credit_note = 0 THEN issue_date END) AS last_invoice_date
     FROM invoices
     ${customerId === undefined ? "" : "WHERE customer_id = ?"}
     GROUP BY customer_id`,
    customerId === undefined ? [period.start, period.end] : [period.start, period.end, customerId],
  );
  return new Map(
    rows.map((r) => [
      r.customer_id,
      {
        // Rounded per customer, while the overview rounds its total once: with several foreign-currency
        // customers the customers' sum can differ from the overview by a few cents.
        revenueNet: Math.round(r.revenue_net),
        openBalance: Math.round(r.open_balance),
        openCount: r.open_count,
        lastInvoiceDate: r.last_invoice_date,
      },
    ]),
  );
}

/** The figures of every customer that has invoices; a customer without any is absent. */
export function loadCustomerListFigures(period: Period): Promise<Map<number, InvoiceFigures>> {
  return selectInvoiceFigures(period);
}

/**
 * Calendar days from the issue date to the day of full payment, averaged over the customer's paid
 * invoices; null without any. Counted per local day, because issue dates and payments carry times of day.
 */
async function averagePaymentDays(customerId: number): Promise<number | null> {
  const [row] = await select<{ days: number | null }>(
    `SELECT AVG(MAX(julianday(date(paid_at, 'unixepoch', 'localtime')) - julianday(date(issue_date, 'unixepoch', 'localtime')), 0)) AS days
     FROM invoices
     WHERE customer_id = ? AND status = 'paid' AND is_credit_note = 0 AND paid_at IS NOT NULL`,
    [customerId],
  );
  return row?.days == null ? null : Math.round(row.days);
}

/** Finished time entries of the customer's projects that no invoice has claimed yet. */
export async function unbilledMinutes(customerId: number): Promise<number> {
  const [row] = await select<{ minutes: number }>(
    `SELECT COALESCE(SUM(t.duration_minutes), 0) AS minutes
     FROM time_entries t
     INNER JOIN projects p ON p.id = t.project_id
     WHERE p.customer_id = ? AND t.invoice_id IS NULL AND t.duration_minutes IS NOT NULL`,
    [customerId],
  );
  return row?.minutes ?? 0;
}

export type CustomerSeries = {
  id: number;
  name: string;
  interval: RecurringInterval;
  nextDueDate: number;
  active: boolean;
  /** What one generated invoice adds up to before VAT, in EUR cents. */
  netCent: number;
};

type SeriesRow = {
  id: number;
  name: string;
  interval: RecurringInterval;
  next_due_date: number;
  active: number;
};

type SeriesItemRow = { recurring_id: number; quantity: number; unit_price: number; vat_rate: number };

async function listCustomerSeries(customerId: number): Promise<CustomerSeries[]> {
  const [series, items] = await Promise.all([
    select<SeriesRow>(
      `SELECT id, name, interval, next_due_date, active
       FROM recurring_invoices
       WHERE customer_id = ?
       ORDER BY active DESC, next_due_date ASC, id ASC`,
      [customerId],
    ),
    select<SeriesItemRow>(
      `SELECT ri.recurring_id, ri.quantity, ri.unit_price, ri.vat_rate
       FROM recurring_invoice_items ri
       INNER JOIN recurring_invoices r ON r.id = ri.recurring_id
       WHERE r.customer_id = ?`,
      [customerId],
    ),
  ]);
  return series.map((r) => ({
    id: r.id,
    name: r.name,
    interval: r.interval,
    nextDueDate: r.next_due_date,
    active: r.active === 1,
    netCent: items
      .filter((item) => item.recurring_id === r.id)
      .reduce(
        (sum, item) =>
          sum + computeLineTotal({ quantity: item.quantity, unitPrice: item.unit_price, vatRate: item.vat_rate }),
        0,
      ),
  }));
}

export type CustomerOverview = InvoiceFigures & {
  /** Null while the customer has no paid invoice. */
  averagePaymentDays: number | null;
  unbilledMinutes: number;
  series: CustomerSeries[];
};

export async function loadCustomerOverview(customerId: number, period: Period): Promise<CustomerOverview> {
  const [figures, averageDays, minutes, series] = await Promise.all([
    selectInvoiceFigures(period, customerId),
    averagePaymentDays(customerId),
    unbilledMinutes(customerId),
    listCustomerSeries(customerId),
  ]);
  return {
    ...(figures.get(customerId) ?? EMPTY_INVOICE_FIGURES),
    averagePaymentDays: averageDays,
    unbilledMinutes: minutes,
    series,
  };
}
