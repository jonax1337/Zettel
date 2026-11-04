import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, select } = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn() }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  execute,
  insert: vi.fn(),
  select,
}));
vi.mock("./queries", () => ({ getVendor: vi.fn() }));

import {
  getExpenseYears,
  listExpenses,
  loadExpensesForExport,
  markExpensePaid,
  recordExpenseValidation,
} from "./expenses";

const expenseRow = (id: number, vendorSnapshot: string) => ({
  id,
  number: `V-${id}`,
  internal_number: `EX-2026-000${id}`,
  vendor_id: 1,
  vendor_snapshot: vendorSnapshot,
  issue_date: 100,
  due_date: null,
  paid_date: null,
  status: "open",
  subtotal: 1000,
  vat_amount: 190,
  total: 1190,
  currency: "EUR",
  is_reverse_charge: 0,
  reverse_charge_type: "none",
  zugferd_extracted: 0,
  pdf_path: null,
  notes: null,
  created_at: 1,
  updated_at: 1,
  last_validation_status: null,
  last_validated_at: null,
  last_validation_findings_count: null,
});

const itemRow = (expenseId: number, position: number) => ({
  id: expenseId * 10 + position,
  expense_id: expenseId,
  position,
  description: `Pos ${position}`,
  category: null,
  category_id: null,
  datev_account: null,
  quantity: 1,
  unit: "Stk",
  unit_price: 1000,
  vat_rate: 19,
  line_total: 1000,
});

beforeEach(() => {
  execute.mockReset();
  select.mockReset();
});

describe("loadExpensesForExport", () => {
  it("groups items by expense and reads vendor name and VAT id from the snapshot", async () => {
    select
      .mockResolvedValueOnce([
        expenseRow(1, JSON.stringify({ name: "Lieferant A", vatId: "DE123" })),
        expenseRow(2, "{}"),
      ])
      .mockResolvedValueOnce([itemRow(1, 1), itemRow(1, 2), itemRow(2, 1)]);

    const result = await loadExpensesForExport(0, 1000);

    expect(result.map((r) => r.items.length)).toEqual([2, 1]);
    expect(result[0]).toMatchObject({ vendorName: "Lieferant A", vendorVatId: "DE123" });
    expect(result[1]).toMatchObject({ vendorName: "—", vendorVatId: null });
  });

  it("falls back to placeholders for an unreadable vendor snapshot", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    select.mockResolvedValueOnce([expenseRow(1, "not json")]).mockResolvedValueOnce([]);

    const [row] = await loadExpensesForExport(0, 1000);

    expect(row).toMatchObject({ vendorName: "—", vendorVatId: null, items: [] });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("includes cancelled expenses only on request", async () => {
    select.mockResolvedValue([]);

    await loadExpensesForExport(0, 1000);
    await loadExpensesForExport(0, 1000, { includeCancelled: true });

    expect(select.mock.calls[0][0]).toContain("status IN ('open','paid')");
    expect(select.mock.calls[1][0]).toContain("status IN ('open','paid','cancelled')");
  });

  it("skips the item query when no expense matches", async () => {
    select.mockResolvedValueOnce([]);

    expect(await loadExpensesForExport(0, 1000)).toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe("listExpenses", () => {
  it("searches internal number, vendor invoice number and vendor name", async () => {
    select.mockResolvedValueOnce([]);

    await listExpenses({ search: "Acme" });

    const [sql, binds] = select.mock.calls[0];
    expect(sql).toContain("(e.internal_number LIKE ? OR e.number LIKE ? OR v.name LIKE ?)");
    expect(binds).toEqual(["%Acme%", "%Acme%", "%Acme%"]);
  });

  it("labels expenses of a deleted vendor", async () => {
    select.mockResolvedValueOnce([{ ...expenseRow(1, "{}"), vendor_name: null }]);

    const [row] = await listExpenses();

    expect(row.vendorName).toBe("—");
  });
});

describe("getExpenseYears", () => {
  it("groups by local year, matching the local-time year filter of the list", async () => {
    select.mockResolvedValueOnce([{ y: 2026 }, { y: 2025 }]);

    await expect(getExpenseYears()).resolves.toEqual([2026, 2025]);

    expect(select.mock.calls[0][0]).toContain("'localtime'");
  });
});

describe("recordExpenseValidation", () => {
  it("stores status and findings count for the expense", async () => {
    await recordExpenseValidation(4, "valid", 0);

    const [sql, binds] = execute.mock.calls[0];
    expect(sql).toContain("UPDATE expenses SET last_validation_status = ?");
    expect(binds).toEqual(["valid", 0, 4]);
  });
});

describe("markExpensePaid", () => {
  it("uses the given paid date", async () => {
    await markExpensePaid(4, 1234);

    expect(execute.mock.calls[0][1]).toEqual([1234, 4]);
  });
});
