import { execute, select } from "./client";
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

export type CategoryInput = Omit<ExpenseCategory, "id" | "createdAt">;

export async function listCategories(opts: { includeArchived?: boolean } = {}): Promise<ExpenseCategory[]> {
  const where = opts.includeArchived ? "" : "WHERE archived = 0";
  const rows = await select<CategoryRow>(
    `SELECT * FROM expense_categories ${where} ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
  );
  return rows.map(mapCategory);
}

export async function getCategory(id: number): Promise<ExpenseCategory | null> {
  const rows = await select<CategoryRow>("SELECT * FROM expense_categories WHERE id = ?", [id]);
  return rows.length ? mapCategory(rows[0]) : null;
}

export async function createCategory(input: CategoryInput): Promise<number> {
  const res = await execute(
    `INSERT INTO expense_categories
       (name, datev_account_skr03, datev_account_skr04, builtin, archived, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.datevAccountSkr03 ?? null,
      input.datevAccountSkr04 ?? null,
      input.builtin ? 1 : 0,
      input.archived ? 1 : 0,
      input.sortOrder ?? 0,
    ],
  );
  return Number(res.lastInsertId ?? 0);
}

export async function updateCategory(id: number, input: CategoryInput): Promise<void> {
  await execute(
    `UPDATE expense_categories SET
       name = ?, datev_account_skr03 = ?, datev_account_skr04 = ?,
       archived = ?, sort_order = ?
     WHERE id = ?`,
    [
      input.name,
      input.datevAccountSkr03 ?? null,
      input.datevAccountSkr04 ?? null,
      input.archived ? 1 : 0,
      input.sortOrder ?? 0,
      id,
    ],
  );
}

export async function deleteCategory(id: number): Promise<void> {
  await execute("DELETE FROM expense_categories WHERE id = ?", [id]);
}

export async function setCategoryArchived(id: number, archived: boolean): Promise<void> {
  await execute(
    "UPDATE expense_categories SET archived = ? WHERE id = ?",
    [archived ? 1 : 0, id],
  );
}

/** Resolve the DATEV account for a given category and SKR profile. Returns
 * `null` when no override is configured — caller falls back to its default. */
export function accountForSkr(
  cat: ExpenseCategory,
  skr: "SKR03" | "SKR04",
): string | null {
  return skr === "SKR03" ? cat.datevAccountSkr03 : cat.datevAccountSkr04;
}
