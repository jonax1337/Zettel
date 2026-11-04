import { select } from "./client";
import type { ExpenseCategory } from "./schema";

type CategoryRow = {
  id: number;
  name: string;
  datev_account_skr03: string | null;
  datev_account_skr04: string | null;
  builtin: number;
  archived: number;
  sort_order: number;
  created_at: number;
};

function mapCategory(r: CategoryRow): ExpenseCategory {
  return {
    id: r.id,
    name: r.name,
    datevAccountSkr03: r.datev_account_skr03,
    datevAccountSkr04: r.datev_account_skr04,
    builtin: r.builtin === 1,
    archived: r.archived === 1,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

export async function listCategories(opts: { includeArchived?: boolean } = {}): Promise<ExpenseCategory[]> {
  const where = opts.includeArchived ? "" : "WHERE archived = 0";
  const rows = await select<CategoryRow>(
    `SELECT * FROM expense_categories ${where} ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
  );
  return rows.map(mapCategory);
}

/** Resolve the DATEV account for a given category and SKR profile. Returns
 * `null` when no override is configured — caller falls back to its default. */
export function accountForSkr(
  cat: ExpenseCategory,
  skr: "SKR03" | "SKR04",
): string | null {
  return skr === "SKR03" ? cat.datevAccountSkr03 : cat.datevAccountSkr04;
}
