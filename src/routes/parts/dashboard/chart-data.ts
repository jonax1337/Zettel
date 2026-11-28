import type { ExpectedColumn, IncomeMonth } from "$lib/components/charts/chart-types";
import type { MonthAmount } from "$lib/dashboard/overview-queries";
import type { MonthPoint, TopCustomerRow } from "$lib/dashboard/queries";
import { monthKey } from "$lib/dashboard/period";
import type { ExpectedPayments } from "$lib/dashboard/weeks";
import { addDaysUnix, MONTHS_DE } from "$lib/utils/date";
import { centsToEur } from "$lib/utils/money";
import { pluralize } from "../entity/format";

const DAYS_IN_WEEK_SPAN = 6;

/**
 * One entry per month of the period. The three lists come from queries over the
 * same months, so they line up by position; a month is looked up by key anyway.
 */
export function incomeMonths(
  revenue: MonthPoint[],
  expenses: MonthAmount[],
  lastYearRevenue: MonthPoint[],
  now: number,
): IncomeMonth[] {
  const expensesByKey = new Map(expenses.map((m) => [monthKey(m), m.amount]));
  return revenue.map((month, index) => ({
    key: monthKey(month),
    year: month.year,
    month: month.month,
    label: month.label,
    title: `${MONTHS_DE[month.month - 1]} ${month.year}`,
    revenue: month.net,
    grossRevenue: month.total,
    expenses: expensesByKey.get(monthKey(month)) ?? 0,
    lastYearRevenue: lastYearRevenue[index]?.net ?? 0,
    future: new Date(month.year, month.month - 1, 1).getTime() / 1000 > now,
  }));
}

const shortDate = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

/** The overdue column first, then one per calendar week. */
export function expectedColumns({ overdue, weeks }: ExpectedPayments): ExpectedColumn[] {
  const overdueColumn: ExpectedColumn = {
    key: "overdue",
    label: "überfällig",
    overdue: overdue.total,
    open: 0,
    estimate: 0,
    tooltip:
      overdue.count === 0
        ? "Bereits überfällig\nnichts überfällig"
        : `Bereits überfällig\n${centsToEur(overdue.total)} · ${overdue.count} ${pluralize(overdue.count, "Rechnung", "Rechnungen")}`,
  };
  const weekColumns = weeks.map((week): ExpectedColumn => {
    const lines = [`KW ${week.weekNumber} · ${shortDate(week.weekStart)} bis ${shortDate(addDaysUnix(week.weekStart, DAYS_IN_WEEK_SPAN))}`];
    if (week.openCount > 0) {
      lines.push(`Fällig ${centsToEur(week.openCent)} · ${week.openCount} ${pluralize(week.openCount, "Rechnung", "Rechnungen")}`);
    }
    if (week.estimateCount > 0) {
      lines.push(`Geschätzt etwa ${centsToEur(week.estimateCent)} aus ${week.estimateCount} ${pluralize(week.estimateCount, "Serie", "Serien")}`);
    }
    if (lines.length === 1) lines.push("keine Fälligkeit");
    return {
      key: String(week.weekStart),
      label: `KW ${week.weekNumber}`,
      overdue: 0,
      open: week.openCent,
      estimate: week.estimateCent,
      tooltip: lines.join("\n"),
    };
  });
  return [overdueColumn, ...weekColumns];
}

export type CustomerShare = {
  customer: TopCustomerRow;
  /** Whole percent of the period's revenue; null when there is no revenue to relate to. */
  percent: number | null;
  /** Bar length relative to the strongest customer, 0 to 1. */
  ratio: number;
};

/** Customer totals are gross, so the whole is the period's gross revenue. */
export function customerShares(customers: TopCustomerRow[], revenueGross: number): CustomerShare[] {
  const strongest = Math.max(1, ...customers.map((c) => c.total));
  return customers.map((customer) => ({
    customer,
    percent: revenueGross > 0 ? Math.round((Math.max(0, customer.total) / revenueGross) * 100) : null,
    ratio: Math.max(0, customer.total) / strongest,
  }));
}
