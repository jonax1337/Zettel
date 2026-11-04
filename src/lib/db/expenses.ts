import { execute, insert, select } from "./client";
import { drawNextNumber } from "./numbering";
import type {
  Expense,
  ExpenseItem,
  ExpenseStatus,
  VendorSnapshot,
} from "./schema";
import { parseSnapshot } from "./snapshot-json";
import { buildVendorSnapshot } from "./snapshots";
import { nowUnix } from "$lib/utils/date";
import { computeLineTotal, computeTotals as computeTotalsPure, type Totals } from "$lib/utils/totals";

export { computeLineTotal };

const MISSING_VENDOR_NAME = "—";

type ExpenseRow = {
  id: number;
  number: string | null;
  internal_number: string;
  vendor_id: number;
  vendor_snapshot: string;
  issue_date: number;
  due_date: number | null;
  paid_date: number | null;
  status: ExpenseStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  currency: string;
  is_reverse_charge: number;
  reverse_charge_type: string;
  zugferd_extracted: number;
  pdf_path: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  last_validation_status: string | null;
  last_validated_at: number | null;
  last_validation_findings_count: number | null;
};

type ExpenseItemRow = {
  id: number;
  expense_id: number;
  position: number;
  description: string;
  category: string | null;
  category_id: number | null;
  datev_account: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
};

function mapExpense(r: ExpenseRow): Expense {
  return {
    id: r.id,
    number: r.number,
    internalNumber: r.internal_number,
    vendorId: r.vendor_id,
    vendorSnapshot: r.vendor_snapshot,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    paidDate: r.paid_date,
    status: r.status,
    subtotal: r.subtotal,
    vatAmount: r.vat_amount,
    total: r.total,
    currency: r.currency,
    isReverseCharge: r.is_reverse_charge === 1,
    reverseChargeType: r.reverse_charge_type as Expense["reverseChargeType"],
    zugferdExtracted: r.zugferd_extracted === 1,
    pdfPath: r.pdf_path,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastValidationStatus: r.last_validation_status as Expense["lastValidationStatus"],
    lastValidatedAt: r.last_validated_at,
    lastValidationFindingsCount: r.last_validation_findings_count,
  };
}

function mapItem(r: ExpenseItemRow): ExpenseItem {
  return {
    id: r.id,
    expenseId: r.expense_id,
    position: r.position,
    description: r.description,
    category: r.category,
    categoryId: r.category_id,
    datevAccount: r.datev_account,
    quantity: r.quantity,
    unit: r.unit,
    unitPrice: r.unit_price,
    vatRate: r.vat_rate,
    lineTotal: r.line_total,
  };
}

export type ExpenseItemInput = {
  description: string;
  category: string | null;
  categoryId?: number | null;
  datevAccount: string | null;
  quantity: number;
  unit: string;
  unitPrice: number; // cents
  vatRate: number; // percent
};

export type ExpenseFormInput = {
  number: string | null; // vendor's invoice number
  vendorId: number;
  issueDate: number;
  dueDate: number | null;
  notes: string | null;
  reverseChargeType: Expense["reverseChargeType"];
  pdfPath: string | null;
  items: ExpenseItemInput[];
};

export function computeTotals(
  items: ExpenseItemInput[],
  opts: { isReverseCharge: boolean },
): Totals {
  return computeTotalsPure(items, {
    isKleinunternehmer: false,
    isReverseCharge: opts.isReverseCharge,
  });
}

export type ExpenseFilter = {
  status?: ExpenseStatus | "all";
  year?: number | "all";
  vendorId?: number | "all";
  search?: string;
};

export type ExpenseListRow = Expense & { vendorName: string };

function buildExpenseFilter(filter: ExpenseFilter): { where: string; binds: unknown[] } {
  const wheres: string[] = [];
  const binds: unknown[] = [];

  if (filter.status && filter.status !== "all") {
    wheres.push(`e.status = ?`);
    binds.push(filter.status);
  }
  if (filter.vendorId && filter.vendorId !== "all") {
    wheres.push(`e.vendor_id = ?`);
    binds.push(filter.vendorId);
  }
  if (filter.year && filter.year !== "all") {
    const start = Math.floor(new Date(filter.year, 0, 1).getTime() / 1000);
    const end = Math.floor(new Date(filter.year + 1, 0, 1).getTime() / 1000);
    wheres.push(`e.issue_date >= ? AND e.issue_date < ?`);
    binds.push(start, end);
  }
  if (filter.search && filter.search.trim() !== "") {
    wheres.push(`(e.internal_number LIKE ? OR e.number LIKE ? OR v.name LIKE ?)`);
    const q = `%${filter.search.trim()}%`;
    binds.push(q, q, q);
  }

  return { where: wheres.length ? `WHERE ${wheres.join(" AND ")}` : "", binds };
}

export async function listExpenses(filter: ExpenseFilter = {}): Promise<ExpenseListRow[]> {
  const { where, binds } = buildExpenseFilter(filter);
  const rows = await select<ExpenseRow & { vendor_name: string | null }>(
    `SELECT e.*, v.name AS vendor_name
     FROM expenses e
     LEFT JOIN vendors v ON v.id = e.vendor_id
     ${where}
     ORDER BY e.issue_date DESC, e.id DESC`,
    binds,
  );
  return rows.map((r) => ({
    ...mapExpense(r),
    vendorName: r.vendor_name ?? MISSING_VENDOR_NAME,
  }));
}

export async function getExpense(
  id: number,
): Promise<{ expense: Expense; items: ExpenseItem[] } | null> {
  const rows = await select<ExpenseRow>("SELECT * FROM expenses WHERE id = ?", [id]);
  if (!rows.length) return null;
  const itemRows = await select<ExpenseItemRow>(
    "SELECT * FROM expense_items WHERE expense_id = ? ORDER BY position ASC",
    [id],
  );
  return { expense: mapExpense(rows[0]), items: itemRows.map(mapItem) };
}

export async function getExpenseYears(): Promise<number[]> {
  const rows = await select<{ y: number }>(
    "SELECT DISTINCT CAST(strftime('%Y', issue_date, 'unixepoch', 'localtime') AS INTEGER) AS y FROM expenses ORDER BY y DESC",
  );
  return rows.map((r) => r.y).filter((y) => Number.isFinite(y));
}

export async function listCategories(): Promise<string[]> {
  const rows = await select<{ category: string }>(
    "SELECT DISTINCT category FROM expense_items WHERE category IS NOT NULL AND category != '' ORDER BY category COLLATE NOCASE ASC",
  );
  return rows.map((r) => r.category);
}

async function writeItems(expenseId: number, items: ExpenseItemInput[]): Promise<void> {
  await execute("DELETE FROM expense_items WHERE expense_id = ?", [expenseId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const line = computeLineTotal(it);
    await execute(
      `INSERT INTO expense_items
        (expense_id, position, description, category, category_id, datev_account,
         quantity, unit, unit_price, vat_rate, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expenseId,
        i + 1,
        it.description,
        it.category,
        it.categoryId ?? null,
        it.datevAccount,
        it.quantity,
        it.unit,
        it.unitPrice,
        it.vatRate,
        line,
      ],
    );
  }
}

export type CreateExpenseOptions = {
  zugferdExtracted?: boolean;
  initialStatus?: ExpenseStatus;
};

export async function createExpense(
  input: ExpenseFormInput,
  opts: CreateExpenseOptions = {},
): Promise<number> {
  const snapshot = await buildVendorSnapshot(input.vendorId);
  const isReverseCharge = input.reverseChargeType !== "none";
  const totals = computeTotals(input.items, { isReverseCharge });
  const internalNumber = await drawNextNumber("expense", input.issueDate);

  const id = await insert(
    `INSERT INTO expenses
      (number, internal_number, vendor_id, vendor_snapshot, issue_date, due_date,
       status, subtotal, vat_amount, total, currency,
       is_reverse_charge, reverse_charge_type, zugferd_extracted, pdf_path, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?)`,
    [
      input.number,
      internalNumber,
      input.vendorId,
      JSON.stringify(snapshot),
      input.issueDate,
      input.dueDate,
      opts.initialStatus ?? "open",
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      isReverseCharge ? 1 : 0,
      input.reverseChargeType,
      opts.zugferdExtracted ? 1 : 0,
      input.pdfPath,
      input.notes,
    ],
  );
  await writeItems(id, input.items);
  return id;
}

export async function updateExpense(id: number, input: ExpenseFormInput): Promise<void> {
  const existing = await getExpense(id);
  if (!existing) throw new Error(`Eingangsrechnung ${id} nicht gefunden.`);
  if (existing.expense.status === "paid" || existing.expense.status === "cancelled") {
    throw new Error("Bezahlte oder stornierte Eingangsrechnungen sind unveränderlich.");
  }
  const isReverseCharge = input.reverseChargeType !== "none";
  const totals = computeTotals(input.items, { isReverseCharge });

  let snapshotJson = existing.expense.vendorSnapshot;
  if (input.vendorId !== existing.expense.vendorId) {
    snapshotJson = JSON.stringify(await buildVendorSnapshot(input.vendorId));
  }

  await execute(
    `UPDATE expenses SET
      number = ?, vendor_id = ?, vendor_snapshot = ?,
      issue_date = ?, due_date = ?,
      subtotal = ?, vat_amount = ?, total = ?,
      is_reverse_charge = ?, reverse_charge_type = ?,
      pdf_path = ?, notes = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.number,
      input.vendorId,
      snapshotJson,
      input.issueDate,
      input.dueDate,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      isReverseCharge ? 1 : 0,
      input.reverseChargeType,
      input.pdfPath,
      input.notes,
      id,
    ],
  );
  await writeItems(id, input.items);
}

export async function deleteExpense(id: number): Promise<void> {
  const existing = await getExpense(id);
  if (!existing) return;
  if (existing.expense.status === "paid") {
    throw new Error("Bezahlte Eingangsrechnungen können nicht gelöscht werden — bitte stornieren.");
  }
  // expense_items has no FK cascade to expenses.
  await execute("DELETE FROM expense_items WHERE expense_id = ?", [id]);
  await execute("DELETE FROM expenses WHERE id = ?", [id]);
}

export async function markExpensePaid(id: number, paidDate?: number): Promise<void> {
  const ts = paidDate ?? nowUnix();
  await execute(
    `UPDATE expenses SET status = 'paid', paid_date = ?, updated_at = unixepoch()
     WHERE id = ? AND status IN ('open','draft')`,
    [ts, id],
  );
}

export async function recordExpenseValidation(
  id: number,
  status: NonNullable<Expense["lastValidationStatus"]>,
  findingsCount: number | null,
): Promise<void> {
  await execute(
    "UPDATE expenses SET last_validation_status = ?, last_validated_at = unixepoch(), last_validation_findings_count = ? WHERE id = ?",
    [status, findingsCount, id],
  );
}

export async function cancelExpense(id: number): Promise<void> {
  await execute(
    "UPDATE expenses SET status = 'cancelled', updated_at = unixepoch() WHERE id = ?",
    [id],
  );
}

// --- Export helpers ---

export type ExpenseForExport = {
  expense: Expense;
  items: ExpenseItem[];
  vendorName: string;
  vendorVatId: string | null;
};

async function loadItemsByExpense(expenseIds: number[]): Promise<Map<number, ExpenseItem[]>> {
  const placeholders = expenseIds.map(() => "?").join(",");
  const itemRows = await select<ExpenseItemRow>(
    `SELECT * FROM expense_items WHERE expense_id IN (${placeholders}) ORDER BY expense_id, position`,
    expenseIds,
  );
  const itemsByExpense = new Map<number, ExpenseItem[]>();
  for (const row of itemRows) {
    const items = itemsByExpense.get(row.expense_id) ?? [];
    items.push(mapItem(row));
    itemsByExpense.set(row.expense_id, items);
  }
  return itemsByExpense;
}

export async function loadExpensesForExport(
  dateFromUnix: number,
  dateToUnix: number,
  opts: { includeCancelled?: boolean } = {},
): Promise<ExpenseForExport[]> {
  const statusFilter = opts.includeCancelled
    ? "status IN ('open','paid','cancelled')"
    : "status IN ('open','paid')";
  const rows = await select<ExpenseRow>(
    `SELECT * FROM expenses
     WHERE ${statusFilter}
       AND issue_date >= ? AND issue_date <= ?
     ORDER BY issue_date ASC, id ASC`,
    [dateFromUnix, dateToUnix],
  );
  if (!rows.length) return [];

  const itemsByExpense = await loadItemsByExpense(rows.map((r) => r.id));
  return rows.map((r) => {
    const vendor = parseSnapshot<VendorSnapshot>(r.vendor_snapshot, `Lieferantensnapshot ${r.internal_number}`);
    return {
      expense: mapExpense(r),
      items: itemsByExpense.get(r.id) ?? [],
      vendorName: vendor.name ?? MISSING_VENDOR_NAME,
      vendorVatId: vendor.vatId ?? null,
    };
  });
}
