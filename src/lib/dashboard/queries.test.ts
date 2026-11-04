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
import { monthlyRevenueInPeriod, oldestOverdue } from "./queries";

type InvoiceSeed = {
  status?: string;
  issueDate?: number;
  dueDate?: number;
  total: number;
  subtotal?: number;
  eurTotalCent?: number | null;
  amountPaidCent?: number | null;
};

function seedInvoice(inv: InvoiceSeed): void {
  sqlite
    .current!.prepare(
      `INSERT INTO invoices (status, issue_date, due_date, total, subtotal, eur_total_cent, amount_paid_cent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      inv.status ?? "sent",
      inv.issueDate ?? 0,
      inv.dueDate ?? 0,
      inv.total,
      inv.subtotal ?? inv.total,
      inv.eurTotalCent ?? null,
      inv.amountPaidCent ?? null,
    );
}

beforeEach(() => {
  sqlite.queries = [];
  sqlite.current = new DatabaseSync(":memory:") as SqliteDatabase;
  sqlite.current.exec(`CREATE TABLE invoices (
    id INTEGER PRIMARY KEY, status TEXT, issue_date INTEGER, due_date INTEGER,
    total INTEGER, subtotal INTEGER, eur_total_cent INTEGER, amount_paid_cent INTEGER)`);
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

  it("keeps credit notes negative", async () => {
    seedInvoice({ total: -10_000, eurTotalCent: -9_200 });

    expect((await oldestOverdue()).openTotal).toBe(-9_200);
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
