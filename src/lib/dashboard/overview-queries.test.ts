import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "$lib/db/sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("$lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/db/client")>()),
  ...(await import("$lib/db/sqlite-test-db")).sqliteClient(sqlite),
}));

import { SECONDS_PER_DAY, toUnix } from "$lib/utils/date";
import { overdueOf } from "./age-buckets";
import { oneYearEarlier, periodForYear } from "./period";
import { cashFlowForecast30d, monthlyRevenueInPeriod, oldestOverdue, openInvoiceRows } from "./queries";
import {
  draftInvoiceSummary,
  expectedPaymentsByWeek,
  monthlyExpensesNet,
  receivablesByAge,
} from "./overview-queries";

// Friday, noon: a mid-week, mid-day "now" that stays clear of midnight and DST edges.
const NOW = toUnix(new Date(2026, 10, 27, 12));
const day = (offsetFromNow: number) => NOW + offsetFromNow * SECONDS_PER_DAY;
const date = (year: number, month: number, dayOfMonth: number) => toUnix(new Date(year, month - 1, dayOfMonth, 10));

const database = (): SqliteDatabase => sqlite.current!;

type InvoiceSeed = {
  status?: string;
  issueDate?: number;
  dueDate?: number;
  total: number;
  subtotal?: number;
  eurTotalCent?: number | null;
  amountPaidCent?: number | null;
  currency?: string;
  creditNoteOf?: number;
};

let invoiceCounter = 0;

function seedInvoice(inv: InvoiceSeed): number {
  invoiceCounter += 1;
  const result = database()
    .prepare(
      `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status, subtotal, vat_amount,
                             total, eur_total_cent, amount_paid_cent, currency, is_credit_note, corrects_invoice_id)
       VALUES (?, 1, '{"name":"Acme GmbH"}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      inv.status === "draft" ? `DRAFT-${invoiceCounter}` : `RE-${invoiceCounter}`,
      inv.issueDate ?? day(-40),
      inv.dueDate ?? day(10),
      inv.status ?? "sent",
      inv.subtotal ?? inv.total,
      (inv.total - (inv.subtotal ?? inv.total)),
      inv.total,
      inv.eurTotalCent ?? null,
      inv.amountPaidCent ?? 0,
      inv.currency ?? "EUR",
      inv.creditNoteOf ? 1 : 0,
      inv.creditNoteOf ?? null,
    ) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

function seedExpense(status: string, issueDate: number, subtotal: number): void {
  database()
    .prepare(
      `INSERT INTO expenses (internal_number, vendor_id, status, issue_date, due_date, subtotal, vat_amount, total)
       VALUES (?, 1, ?, ?, ?, ?, 0, ?)`,
    )
    .run(`EX-${Math.random()}`, status, issueDate, issueDate, subtotal, subtotal);
}

function seedTemplate(nextDueDate: number, unitPriceCent: number, options: { active?: boolean } = {}): void {
  const result = database()
    .prepare(
      `INSERT INTO recurring_invoices (name, customer_id, interval, start_date, next_due_date, active)
       VALUES ('Serie', 1, 'monthly', ?, ?, ?)`,
    )
    .run(nextDueDate, nextDueDate, options.active === false ? 0 : 1);
  database()
    .prepare(
      `INSERT INTO recurring_invoice_items (recurring_id, position, description, quantity, unit_price, vat_rate)
       VALUES (?, 1, 'Leistung', 1, ?, 19)`,
    )
    .run(Number(result.lastInsertRowid), unitPriceCent);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  invoiceCounter = 0;
  sqlite.current = migratedDatabase();
  database().exec(`
    INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH');
    INSERT INTO vendors (id, vendor_number, name) VALUES (1, 'L-0001', 'Lieferant');
  `);
});

afterEach(() => vi.useRealTimers());

describe("monthlyExpensesNet", () => {
  it("sums the net amount per month and fills months without expenses with zero", async () => {
    seedExpense("open", date(2026, 1, 5), 10_000);
    seedExpense("paid", date(2026, 1, 20), 2_500);
    seedExpense("paid", date(2026, 3, 2), 4_000);

    const months = await monthlyExpensesNet(periodForYear(2026));

    expect(months.map((m) => m.amount)).toEqual([12_500, 0, 4_000, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(months[0]).toMatchObject({ year: 2026, month: 1, label: "Jan" });
  });

  it("agrees with the expense KPI: drafts and cancelled expenses stay out", async () => {
    seedExpense("open", date(2026, 2, 5), 1_000);
    seedExpense("draft", date(2026, 2, 6), 9_000);
    seedExpense("cancelled", date(2026, 2, 7), 9_000);

    const months = await monthlyExpensesNet(periodForYear(2026));

    expect(months[1].amount).toBe(1_000);
  });

  it("leaves expenses outside the period out", async () => {
    seedExpense("paid", date(2025, 12, 31), 1_000);
    seedExpense("paid", date(2027, 1, 1), 1_000);

    expect((await monthlyExpensesNet(periodForYear(2026))).every((m) => m.amount === 0)).toBe(true);
  });
});

describe("monthly net revenue", () => {
  it("is the invoice's share of its frozen EUR total for a foreign-currency invoice", async () => {
    // 1190,00 USD gross of which 1000,00 net, frozen at 1000,00 EUR gross: 840,34 EUR net.
    seedInvoice({ issueDate: date(2026, 4, 10), total: 119_000, subtotal: 100_000, currency: "USD", eurTotalCent: 100_000 });

    const [april] = (await monthlyRevenueInPeriod(periodForYear(2026))).filter((m) => m.month === 4);

    expect(april).toMatchObject({ total: 100_000, net: 84_034 });
  });

  it("nets a credit note issued in the same month", async () => {
    seedInvoice({ issueDate: date(2026, 5, 3), total: 11_900, subtotal: 10_000 });
    seedInvoice({ issueDate: date(2026, 5, 20), total: -5_950, subtotal: -5_000, creditNoteOf: 1 });

    const [may] = (await monthlyRevenueInPeriod(periodForYear(2026))).filter((m) => m.month === 5);

    expect(may).toMatchObject({ total: 5_950, net: 5_000 });
  });

  it("goes negative in a month that only holds a credit note", async () => {
    seedInvoice({ issueDate: date(2026, 6, 3), total: -1_190, subtotal: -1_000, creditNoteOf: 1 });

    const [june] = (await monthlyRevenueInPeriod(periodForYear(2026))).filter((m) => m.month === 6);

    expect(june.net).toBe(-1_000);
  });

  it("lines up with the same months one year earlier", async () => {
    seedInvoice({ issueDate: date(2025, 3, 10), total: 2_000 });
    seedInvoice({ issueDate: date(2026, 3, 10), total: 3_000 });

    const thisYear = await monthlyRevenueInPeriod(periodForYear(2026));
    const lastYear = await monthlyRevenueInPeriod(oneYearEarlier(periodForYear(2026)));

    expect(lastYear.map((m) => m.month)).toEqual(thisYear.map((m) => m.month));
    expect([thisYear[2].net, lastYear[2].net]).toEqual([3_000, 2_000]);
  });

  it("only counts invoices that were sent, partly paid or paid", async () => {
    seedInvoice({ issueDate: date(2026, 7, 1), total: 1_000, status: "draft" });
    seedInvoice({ issueDate: date(2026, 7, 1), total: 1_000, status: "cancelled" });
    seedInvoice({ issueDate: date(2026, 7, 1), total: 400, status: "partial", amountPaidCent: 100 });

    const [july] = (await monthlyRevenueInPeriod(periodForYear(2026))).filter((m) => m.month === 7);

    expect(july.net).toBe(400);
  });
});

describe("receivablesByAge", () => {
  const totals = async () => Object.fromEntries((await receivablesByAge(NOW)).map((b) => [b.id, [b.count, b.total]]));

  it("sorts open invoices into the four age buckets by due date", async () => {
    seedInvoice({ total: 1_000, dueDate: day(3) });
    seedInvoice({ total: 2_000, dueDate: day(-1) });
    seedInvoice({ total: 4_000, dueDate: day(-14) });
    seedInvoice({ total: 8_000, dueDate: day(-15) });
    seedInvoice({ total: 16_000, dueDate: day(-30) });
    seedInvoice({ total: 32_000, dueDate: day(-31) });

    expect(await totals()).toEqual({
      notDue: [1, 1_000],
      days1to14: [2, 6_000],
      days15to30: [2, 24_000],
      over30: [1, 32_000],
    });
  });

  it("counts what is still open: payments off, foreign currency converted to EUR", async () => {
    seedInvoice({ total: 10_000, amountPaidCent: 4_000, status: "partial", dueDate: day(-2) });
    // 1000,00 USD frozen at 920,00 EUR, 250,00 USD paid: 690,00 EUR open.
    seedInvoice({ total: 100_000, eurTotalCent: 92_000, amountPaidCent: 25_000, currency: "USD", status: "partial", dueDate: day(-2) });

    expect((await totals()).days1to14).toEqual([2, 75_000]);
  });

  it("leaves out paid and draft invoices, credit notes and an invoice a credit note settles", async () => {
    seedInvoice({ total: 1_000, status: "paid" });
    seedInvoice({ total: 1_000, status: "draft" });
    const settled = seedInvoice({ total: 5_000, dueDate: day(-20) });
    seedInvoice({ total: -5_000, creditNoteOf: settled, dueDate: day(-20) });

    expect((await receivablesByAge(NOW)).every((b) => b.count === 0)).toBe(true);
  });

  it("keeps the remainder of a partially credited invoice", async () => {
    const original = seedInvoice({ total: 10_000, dueDate: day(-20) });
    seedInvoice({ total: -3_000, creditNoteOf: original, dueDate: day(-20) });

    expect((await totals()).days15to30).toEqual([1, 7_000]);
  });

  it("gives the same buckets from rows that were loaded beforehand", async () => {
    seedInvoice({ total: 2_000, dueDate: day(-9) });
    seedInvoice({ total: 4_000, dueDate: day(3) });

    expect(await receivablesByAge(NOW, await openInvoiceRows())).toEqual(await receivablesByAge(NOW));
  });

  it("adds up to the open balance and the overdue part to the oldest-overdue summary", async () => {
    seedInvoice({ total: 1_000, dueDate: day(3) });
    seedInvoice({ total: 2_000, dueDate: day(-9) });
    seedInvoice({ total: 4_000, dueDate: day(-40) });

    const buckets = await receivablesByAge(NOW);
    const summary = await oldestOverdue();

    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(summary.openTotal);
    expect(overdueOf(buckets)).toEqual({ count: 2, total: 6_000 });
    expect(summary.daysOverdue).toBe(40);
  });
});

describe("expectedPaymentsByWeek", () => {
  it("puts overdue amounts in their own column and the rest in the week they fall due", async () => {
    seedInvoice({ total: 1_000, dueDate: day(-5) });
    seedInvoice({ total: 2_000, dueDate: day(2) }); // Sunday 29.11., current week
    seedInvoice({ total: 4_000, dueDate: day(5) }); // Wednesday 2.12., next week
    seedInvoice({ total: 8_000, dueDate: day(31) }); // beyond the horizon

    const { overdue, weeks } = await expectedPaymentsByWeek(NOW);

    expect(overdue).toEqual({ count: 1, total: 1_000 });
    expect(weeks.map((w) => [w.weekNumber, w.openCent])).toEqual([
      [48, 2_000],
      [49, 4_000],
      [50, 0],
      [51, 0],
      [52, 0],
    ]);
  });

  it("adds estimates of due recurring templates, gross, and marks them apart from open invoices", async () => {
    seedTemplate(day(-2), 10_000);
    seedTemplate(day(11), 20_000); // Tuesday 8.12., week 50
    seedTemplate(day(11), 50_000, { active: false });

    const { weeks } = await expectedPaymentsByWeek(NOW);

    expect(weeks[0]).toMatchObject({ estimateCent: 11_900, estimateCount: 1, openCent: 0 });
    expect(weeks[2]).toMatchObject({ estimateCent: 23_800, estimateCount: 1 });
  });

  it("sums up to the figures of the 30-day forecast", async () => {
    seedInvoice({ total: 1_000, dueDate: day(-5) });
    seedInvoice({ total: 6_000, status: "partial", amountPaidCent: 1_000, dueDate: day(4) });
    seedInvoice({ total: 100_000, eurTotalCent: 92_000, currency: "USD", dueDate: day(20) });
    seedTemplate(day(12), 10_000);
    const settled = seedInvoice({ total: 9_000, dueDate: day(-3) });
    seedInvoice({ total: -9_000, creditNoteOf: settled, dueDate: day(-3) });

    const { overdue, weeks } = await expectedPaymentsByWeek(NOW);
    const forecast = await cashFlowForecast30d();

    expect(overdue).toEqual({ count: forecast.overdueCount, total: forecast.overdue });
    expect(weeks.reduce((sum, w) => sum + w.openCent, 0)).toBe(forecast.openDue);
    expect(weeks.reduce((sum, w) => sum + w.openCount, 0)).toBe(forecast.openDueCount);
    expect(weeks.reduce((sum, w) => sum + w.estimateCent, 0)).toBe(forecast.recurringEstimate);
    expect(weeks.reduce((sum, w) => sum + w.estimateCount, 0)).toBe(forecast.recurringCount);
  });
});

describe("draftInvoiceSummary", () => {
  it("counts drafts and sums their EUR value", async () => {
    seedInvoice({ status: "draft", total: 11_900 });
    seedInvoice({ status: "draft", total: 100_000, currency: "USD", eurTotalCent: 92_000 });
    seedInvoice({ status: "sent", total: 5_000 });

    expect(await draftInvoiceSummary()).toEqual({ count: 2, total: 103_900, unconvertedCount: 0 });
  });

  it("leaves a foreign-currency draft without exchange rate out of the sum and reports it", async () => {
    seedInvoice({ status: "draft", total: 11_900 });
    seedInvoice({ status: "draft", total: 100_000, currency: "USD" });

    expect(await draftInvoiceSummary()).toEqual({ count: 2, total: 11_900, unconvertedCount: 1 });
  });

  it("reports nothing when there are no drafts", async () => {
    expect(await draftInvoiceSummary()).toEqual({ count: 0, total: 0, unconvertedCount: 0 });
  });
});
