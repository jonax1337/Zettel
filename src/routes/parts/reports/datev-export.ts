import type { ExpenseCategory } from "$lib/db/schema";
import { accountForSkr } from "$lib/db/expense-categories";
import type { Skr } from "$lib/export/datev";
import { addDaysUnix } from "$lib/utils/date";
import { pluralize } from "../entity/format";

type CategorizedItem = { categoryId?: number | null; datevAccount: string | null };

/** Last second of the calendar day that starts at `dayStartUnix` (DST days are not 24 h long). */
export function endOfDayUnix(dayStartUnix: number): number {
  return addDaysUnix(dayStartUnix, 1) - 1;
}

/** January 1st of the year the export range starts in. */
export function fiscalYearStart(rangeStartUnix: number): Date {
  return new Date(new Date(rangeStartUnix * 1000).getFullYear(), 0, 1);
}

/**
 * Items with a curated category get that category's account for the chosen SKR.
 * An account typed in explicitly always wins.
 */
export function resolveItemAccounts<I extends CategorizedItem>(
  items: I[],
  categoriesById: Map<number, ExpenseCategory>,
  skr: Skr,
): I[] {
  return items.map((item) => {
    if (!item.categoryId || item.datevAccount) return item;
    const category = categoriesById.get(item.categoryId);
    return category ? { ...item, datevAccount: accountForSkr(category, skr) } : item;
  });
}

export function describeExportCounts(invoiceCount: number, expenseCount: number): string {
  const parts: string[] = [];
  if (invoiceCount) parts.push(`${invoiceCount} ${pluralize(invoiceCount, "Rechnung", "Rechnungen")}`);
  if (expenseCount) {
    parts.push(`${expenseCount} ${pluralize(expenseCount, "Eingangsrechnung", "Eingangsrechnungen")}`);
  }
  return parts.join(" + ");
}
