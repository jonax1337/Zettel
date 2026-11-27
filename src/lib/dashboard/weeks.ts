import { addDaysUnix, isoWeekNumber, SECONDS_PER_DAY, startOfDayUnix, toUnix } from "$lib/utils/date";
import type { OpenInvoiceRow } from "./age-buckets";

const MONDAY_BASED_OFFSET = 6;
const DAYS_PER_WEEK = 7;

/** Local midnight of the Monday of the week `unixSeconds` falls into. */
export function startOfWeekUnix(unixSeconds: number): number {
  const day = new Date(unixSeconds * 1000);
  const daysSinceMonday = (day.getDay() + MONDAY_BASED_OFFSET) % DAYS_PER_WEEK;
  return addDaysUnix(startOfDayUnix(day), -daysSinceMonday);
}

export type RecurringEstimate = { dueDate: number; grossCent: number };

export type WeekColumn = {
  weekStart: number;
  weekNumber: number;
  /** Open invoices falling due in this week. */
  openCent: number;
  openCount: number;
  /** Gross sum of recurring templates falling due in this week, an estimate. */
  estimateCent: number;
  estimateCount: number;
};

export type ExpectedPayments = {
  /** Open invoices already past their due date. */
  overdue: { count: number; total: number };
  weeks: WeekColumn[];
};

/**
 * Splits the money expected up to `horizon` into an overdue column and one column
 * per calendar week from the current one on. A template that is already due counts
 * in the current week.
 */
export function bucketExpectedPayments(
  now: number,
  horizon: number,
  openInvoices: OpenInvoiceRow[],
  estimates: RecurringEstimate[],
): ExpectedPayments {
  const weeks: WeekColumn[] = [];
  for (let start = startOfWeekUnix(now); start <= horizon; start = addDaysUnix(start, DAYS_PER_WEEK)) {
    weeks.push({
      weekStart: start,
      weekNumber: isoWeekNumber(new Date(start * 1000)),
      openCent: 0,
      openCount: 0,
      estimateCent: 0,
      estimateCount: 0,
    });
  }
  const weekOf = (unixSeconds: number) => {
    const key = startOfWeekUnix(Math.max(unixSeconds, now));
    return weeks.find((week) => week.weekStart === key);
  };

  const overdue = { count: 0, total: 0 };
  for (const invoice of openInvoices) {
    if (invoice.dueDate < now) {
      overdue.count += 1;
      overdue.total += invoice.balance;
      continue;
    }
    const week = invoice.dueDate <= horizon ? weekOf(invoice.dueDate) : undefined;
    if (!week) continue;
    week.openCent += invoice.balance;
    week.openCount += 1;
  }
  for (const estimate of estimates) {
    const week = estimate.dueDate <= horizon ? weekOf(estimate.dueDate) : undefined;
    if (!week) continue;
    week.estimateCent += estimate.grossCent;
    week.estimateCount += 1;
  }
  return { overdue, weeks };
}
