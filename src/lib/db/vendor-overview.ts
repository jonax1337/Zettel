import { EXPENSE_STATUSES } from "$lib/dashboard/queries";
import type { Period } from "$lib/dashboard/period";
import { select } from "./client";

/**
 * What a vendor's expenses add up to. Only expenses the overview counts (EXPENSE_STATUSES) take part,
 * so drafts and cancelled expenses appear in neither figure. Amounts are the stored gross totals in cents,
 * the same figure the expense list shows per row.
 */
export type VendorExpenseFigures = {
  /** Gross total of the expenses dated within the period. */
  grossInPeriod: number;
  /** Date of the newest counted expense, whatever its year. */
  lastExpenseDate: number | null;
};

export const EMPTY_VENDOR_FIGURES: VendorExpenseFigures = { grossInPeriod: 0, lastExpenseDate: null };

type FigureRow = { vendor_id: number; gross_in_period: number; last_expense_date: number | null };

/** The figures of every vendor that has counted expenses; a vendor without any is absent. */
export async function loadVendorListFigures(period: Period): Promise<Map<number, VendorExpenseFigures>> {
  const rows = await select<FigureRow>(
    `SELECT vendor_id,
            COALESCE(SUM(CASE WHEN issue_date >= ? AND issue_date < ? THEN total END), 0) AS gross_in_period,
            MAX(issue_date) AS last_expense_date
     FROM expenses
     WHERE status IN ${EXPENSE_STATUSES}
     GROUP BY vendor_id`,
    [period.start, period.end],
  );
  return new Map(
    rows.map((r) => [r.vendor_id, { grossInPeriod: r.gross_in_period, lastExpenseDate: r.last_expense_date }]),
  );
}
