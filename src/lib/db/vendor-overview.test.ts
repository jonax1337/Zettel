import { beforeEach, describe, expect, it, vi } from "vitest";
import { periodForYear } from "$lib/dashboard/period";
import { loadKpis } from "$lib/dashboard/queries";
import { toUnix } from "$lib/utils/date";
import { migratedDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { listExpenses } from "./expenses";
import { EMPTY_VENDOR_FIGURES, loadVendorListFigures } from "./vendor-overview";

const YEAR = periodForYear(2026);
const OFFICE = 1;
const CLOUD = 2;
const NEVER = 3;

const day = (month: number, date: number, year = 2026) => toUnix(new Date(year, month - 1, date));

let counter = 0;
function seedExpense(vendorId: number, issueDate: number, total: number, status = "paid", vatAmount = 0) {
  counter += 1;
  sqlite.current!
    .prepare(
      `INSERT INTO expenses (internal_number, vendor_id, issue_date, status, subtotal, vat_amount, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(`EX-${counter}`, vendorId, issueDate, status, total - vatAmount, vatAmount, total);
}

beforeEach(() => {
  counter = 0;
  sqlite.current = migratedDatabase();
  sqlite.current.exec(`INSERT INTO vendors (id, vendor_number, name) VALUES
    (1, 'L-0001', 'Office Depot'), (2, 'L-0002', 'Cloud AG'), (3, 'L-0003', 'Nie benutzt')`);
});

describe("loadVendorListFigures", () => {
  it("sums the gross totals, not the net amounts, and agrees with the Brutto column of the expense list", async () => {
    seedExpense(OFFICE, day(2, 1), 11_900, "open", 1_900);
    seedExpense(OFFICE, day(3, 1), 5_950, "paid", 950);
    seedExpense(OFFICE, day(4, 1), 99_000, "draft", 15_800);

    const figures = (await loadVendorListFigures(YEAR)).get(OFFICE);
    const listed = (await listExpenses({ vendorId: OFFICE })).filter((e) => e.status !== "draft");

    expect(figures?.grossInPeriod).toBe(17_850);
    expect(listed.reduce((sum, e) => sum + e.total, 0)).toBe(17_850);
    expect(listed.reduce((sum, e) => sum + e.subtotal, 0)).toBe(15_000);
  });

  it("sums the gross totals of open and paid expenses within the year", async () => {
    seedExpense(OFFICE, day(2, 1), 11_900, "open");
    seedExpense(OFFICE, day(5, 1), 5_950, "paid");

    const figures = (await loadVendorListFigures(YEAR)).get(OFFICE);

    expect(figures?.grossInPeriod).toBe(17_850);
  });

  it("ignores draft and cancelled expenses in both figures", async () => {
    seedExpense(OFFICE, day(2, 1), 10_000, "paid");
    seedExpense(OFFICE, day(8, 1), 99_000, "draft");
    seedExpense(OFFICE, day(9, 1), 77_000, "cancelled");

    expect((await loadVendorListFigures(YEAR)).get(OFFICE)).toEqual({
      grossInPeriod: 10_000,
      lastExpenseDate: day(2, 1),
    });
  });

  it("leaves expenses of other years out of the sum but keeps them for the last expense date", async () => {
    seedExpense(CLOUD, day(12, 20, 2025), 4_000);
    seedExpense(CLOUD, day(1, 15, 2027), 6_000);

    expect((await loadVendorListFigures(YEAR)).get(CLOUD)).toEqual({
      grossInPeriod: 0,
      lastExpenseDate: day(1, 15, 2027),
    });
  });

  it("keeps vendors apart and omits a vendor without expenses", async () => {
    seedExpense(OFFICE, day(3, 1), 1_000);
    seedExpense(CLOUD, day(4, 1), 2_000);

    const figures = await loadVendorListFigures(YEAR);

    expect(figures.get(OFFICE)?.grossInPeriod).toBe(1_000);
    expect(figures.get(CLOUD)?.grossInPeriod).toBe(2_000);
    expect(figures.has(NEVER)).toBe(false);
    expect(EMPTY_VENDOR_FIGURES).toEqual({ grossInPeriod: 0, lastExpenseDate: null });
  });

  it("counts the boundary days of the year as the overview does", async () => {
    seedExpense(OFFICE, YEAR.start, 100);
    seedExpense(OFFICE, YEAR.end, 900);

    expect((await loadVendorListFigures(YEAR)).get(OFFICE)?.grossInPeriod).toBe(100);
  });

  it("agrees with the expense list's per-row totals for the same data", async () => {
    seedExpense(OFFICE, day(2, 1), 11_900);
    seedExpense(CLOUD, day(6, 1), 3_570, "open");
    seedExpense(OFFICE, day(7, 1), 500, "draft");

    const figures = await loadVendorListFigures(YEAR);
    const kpis = await loadKpis(YEAR);

    const totalGross = [...figures.values()].reduce((sum, f) => sum + f.grossInPeriod, 0);
    expect(totalGross).toBe(15_470);
    // The overview counts net, here equal to gross because the seeded VAT is 0.
    expect(kpis.expenseNet).toBe(totalGross);
  });
});
