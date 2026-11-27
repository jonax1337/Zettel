import { describe, expect, it } from "vitest";
import type { MonthAmount } from "$lib/dashboard/overview-queries";
import type { MonthPoint, TopCustomerRow } from "$lib/dashboard/queries";
import { toUnix } from "$lib/utils/date";
import { customerShares, expectedColumns, incomeMonths } from "./chart-data";

const month = (year: number, m: number, net: number, total = net): MonthPoint => ({
  year,
  month: m,
  label: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"][m - 1],
  total,
  net,
});
const expense = (year: number, m: number, amount: number): MonthAmount => ({ year, month: m, label: "", amount });

describe("incomeMonths", () => {
  const now = toUnix(new Date(2026, 10, 27, 12));

  it("pairs revenue, expenses and last year's revenue per month with a readable title", () => {
    const [november] = incomeMonths(
      [month(2026, 11, 5_000, 5_950)],
      [expense(2026, 11, 1_200)],
      [month(2025, 11, 4_000)],
      now,
    );

    expect(november).toMatchObject({
      key: "2026-11",
      year: 2026,
      month: 11,
      title: "November 2026",
      revenue: 5_000,
      grossRevenue: 5_950,
      expenses: 1_200,
      lastYearRevenue: 4_000,
      future: false,
    });
  });

  it("marks months that have not begun, the current one not included", () => {
    const flags = incomeMonths(
      [month(2026, 11, 0), month(2026, 12, 0)],
      [expense(2026, 11, 0), expense(2026, 12, 0)],
      [month(2025, 11, 0), month(2025, 12, 0)],
      now,
    ).map((m) => m.future);

    expect(flags).toEqual([false, true]);
  });

  it("keeps a negative month from a credit note", () => {
    const [june] = incomeMonths([month(2026, 6, -1_000)], [expense(2026, 6, 0)], [month(2025, 6, 0)], now);

    expect(june.revenue).toBe(-1_000);
  });

  it("takes zero for a month without expenses or a previous-year value", () => {
    const [m] = incomeMonths([month(2026, 3, 100)], [], [], now);

    expect([m.expenses, m.lastYearRevenue]).toEqual([0, 0]);
  });
});

describe("expectedColumns", () => {
  const weekStart = toUnix(new Date(2026, 10, 30));
  const week = { weekStart, weekNumber: 49, openCent: 0, openCount: 0, estimateCent: 0, estimateCount: 0 };

  it("starts with the overdue column and names the weeks", () => {
    const columns = expectedColumns({ overdue: { count: 3, total: 208_150 }, weeks: [week] });

    expect(columns.map((c) => [c.label, c.overdue, c.open, c.estimate])).toEqual([
      ["überfällig", 208_150, 0, 0],
      ["KW 49", 0, 0, 0],
    ]);
    expect(columns[0].tooltip).toMatch(/^Bereits überfällig\n2\.081,50\s€ · 3 Rechnungen$/);
  });

  it("keeps estimates apart from open invoices and says so in the tooltip", () => {
    const [, column] = expectedColumns({
      overdue: { count: 0, total: 0 },
      weeks: [{ ...week, openCent: 131_000, openCount: 1, estimateCent: 50_000, estimateCount: 1 }],
    });

    expect([column.open, column.estimate]).toEqual([131_000, 50_000]);
    expect(column.tooltip).toMatch(/^KW 49 · 30\.11\. bis 06\.12\.\nFällig 1\.310,00\s€ · 1 Rechnung\nGeschätzt etwa 500,00\s€ aus 1 Serie$/);
  });

  it("says when nothing falls due", () => {
    const columns = expectedColumns({ overdue: { count: 0, total: 0 }, weeks: [week] });

    expect(columns[0].tooltip).toBe("Bereits überfällig\nnichts überfällig");
    expect(columns[1].tooltip).toMatch(/\nkeine Fälligkeit$/);
  });
});

describe("customerShares", () => {
  const customer = (customerId: number, total: number): TopCustomerRow => ({
    customerId,
    name: `Kunde ${customerId}`,
    customerNumber: `K-${customerId}`,
    invoiceCount: 1,
    total,
  });

  it("relates each total to the period's gross revenue and scales bars to the strongest customer", () => {
    const shares = customerShares([customer(1, 6_000), customer(2, 3_000)], 20_000);

    expect(shares.map((s) => [s.percent, s.ratio])).toEqual([
      [30, 1],
      [15, 0.5],
    ]);
  });

  it("gives no percentage when there is no revenue to relate to", () => {
    expect(customerShares([customer(1, 100)], 0)[0].percent).toBeNull();
    expect(customerShares([customer(1, 100)], -50)[0].percent).toBeNull();
  });

  it("does not draw a negative total as a negative bar", () => {
    const [share] = customerShares([customer(1, -500)], 1_000);

    expect([share.percent, share.ratio]).toEqual([0, 0]);
  });
});
