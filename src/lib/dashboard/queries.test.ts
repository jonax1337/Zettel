import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The project has no @types/node; node:sqlite is only used to run the real SQL in tests.
import { DatabaseSync } from "node:sqlite";

type SqliteValue = string | number | null;
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { all(...bindings: SqliteValue[]): unknown[]; run(...bindings: SqliteValue[]): unknown };
};

const sqlite = vi.hoisted(() => ({ current: null as SqliteDatabase | null, queries: [] as string[] }));
vi.mock("$lib/db/client", () => ({
  select: async (query: string, bindings: SqliteValue[] = []) => {
    sqlite.queries.push(query);
    return sqlite.current!.prepare(query).all(...bindings);
  },
}));

import { fromIsoDate } from "$lib/utils/date";
import type { Period } from "./period";
import { cashFlowForecast30d, loadKpis, monthlyRevenueInPeriod, oldestOverdue } from "./queries";

type InvoiceSeed = {
  status?: string;
  issueDate?: number;
  dueDate?: number;
  total: number;
  subtotal?: number;
  eurTotalCent?: number | null;
  amountPaidCent?: number | null;
  isCreditNote?: boolean;
  correctsInvoiceId?: number | null;
};

function seedInvoice(inv: InvoiceSeed): number {
  const result = sqlite
    .current!.prepare(
      `INSERT INTO invoices (status, issue_date, due_date, total, subtotal, eur_total_cent, amount_paid_cent,
                             is_credit_note, corrects_invoice_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      inv.status ?? "sent",
      inv.issueDate ?? 0,
      inv.dueDate ?? 0,
      inv.total,
      inv.subtotal ?? inv.total,
      inv.eurTotalCent ?? null,
      inv.amountPaidCent ?? null,
      inv.isCreditNote ? 1 : 0,
      inv.correctsInvoiceId ?? null,
    ) as { lastInsertRowid: number | bigint };
  return Number(result.lastInsertRowid);
}

/** An invoice fully offset by an issued credit note: both rows stay 'sent'. */
function seedCancelledByCreditNote(total: number): void {
  const originalId = seedInvoice({ total });
  seedInvoice({ total: -total, isCreditNote: true, correctsInvoiceId: originalId });
}

beforeEach(() => {
  sqlite.queries = [];
  sqlite.current = new DatabaseSync(":memory:") as SqliteDatabase;
  sqlite.current.exec(`CREATE TABLE invoices (
    id INTEGER PRIMARY KEY, status TEXT, issue_date INTEGER, due_date INTEGER,
    total INTEGER, subtotal INTEGER, eur_total_cent INTEGER, amount_paid_cent INTEGER,
    is_credit_note INTEGER, corrects_invoice_id INTEGER);
  CREATE TABLE expenses (status TEXT, issue_date INTEGER, subtotal INTEGER);
  CREATE TABLE recurring_invoices (id INTEGER PRIMARY KEY, active INTEGER, next_due_date INTEGER, is_reverse_charge INTEGER);
  CREATE TABLE recurring_invoice_items (recurring_id INTEGER, quantity REAL, unit_price INTEGER, vat_rate REAL)`);
});

describe("oldestOverdue open balance", () => {
  it("subtracts payments from the total of an EUR invoice", async () => {
    seedInvoice({ total: 10_000, amountPaidCent: 4_000, status: "partial" });

    expect((await oldestOverdue()).openTotal).toBe(6_000);
  });

  it("converts the paid share of a foreign-currency invoice into EUR instead of subtracting mixed units", async () => {
    // 1000,00 USD frozen at 920,00 EUR; 250,00 USD already paid -> 690,00 EUR still open.
    seedInvoice({ total: 100_000, eurTotalCent: 92_000, amountPaidCent: 25_000, status: "partial" });

    expect((await oldestOverdue()).openTotal).toBe(69_000);
  });

  it("rounds the paid EUR share half up on whole cents", async () => {
    // paid share = 3 * 5 / 2 = 7.5 EUR cent -> 8, so 5 - 8 would be wrong; open = 15 - 8 = 7.
    seedInvoice({ total: 10, eurTotalCent: 15, amountPaidCent: 5, status: "partial" });

    expect((await oldestOverdue()).openTotal).toBe(7);
  });

  it("returns the whole frozen EUR total when nothing was paid", async () => {
    seedInvoice({ total: 100_000, eurTotalCent: 92_000 });

    expect((await oldestOverdue()).openTotal).toBe(92_000);
  });

});

describe("open receivables and credit notes", () => {
  const wholeHistory: Period = { type: "custom", start: 0, end: 4_000_000_000, label: "alles" };

  it("leaves an invoice offset by an issued credit note and the credit note itself out of the overdue summary", async () => {
    seedCancelledByCreditNote(10_000);
    seedInvoice({ total: 5_000, dueDate: 100 });

    expect(await oldestOverdue()).toMatchObject({ openCount: 1, openTotal: 5_000 });
  });

  it("does not count them as open in the KPIs", async () => {
    seedCancelledByCreditNote(10_000);

    expect(await loadKpis(wholeHistory)).toMatchObject({ openCount: 0, openTotal: 0 });
  });

  it("does not forecast them as overdue cash", async () => {
    seedCancelledByCreditNote(10_000);

    expect(await cashFlowForecast30d()).toMatchObject({ overdue: 0, overdueCount: 0 });
  });

  it("keeps an invoice open while its credit note is only a draft", async () => {
    const originalId = seedInvoice({ total: 10_000 });
    seedInvoice({ status: "draft", total: -10_000, isCreditNote: true, correctsInvoiceId: originalId });

    expect(await oldestOverdue()).toMatchObject({ openCount: 1, openTotal: 10_000 });
  });
});

describe("monthlyRevenueInPeriod", () => {
  // SQLite's localtime follows the OS zone, which a test cannot pin on every platform
  // (Windows ignores the IANA TZ the suite sets), so this pins the grouping modifier itself.
  it("groups by the local month, because issue dates are local midnight", async () => {
    const period: Period = {
      type: "custom",
      start: fromIsoDate("2026-01-01"),
      end: fromIsoDate("2026-03-01"),
      label: "Jan-Feb 2026",
    };

    await monthlyRevenueInPeriod(period);

    expect(sqlite.queries.join(" ")).toContain(
      "strftime('%Y-%m', issue_date, 'unixepoch', 'localtime')",
    );
  });
});
