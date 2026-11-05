import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The project has no @types/node; node:sqlite is only used to run the real SQL in tests.
import { DatabaseSync } from "node:sqlite";

type SqliteValue = string | number | null;
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { all(...bindings: SqliteValue[]): unknown[]; run(...bindings: SqliteValue[]): unknown };
};

const sqlite = vi.hoisted(() => ({ current: null as SqliteDatabase | null }));
vi.mock("$lib/db/client", () => ({
  select: async (query: string, bindings: SqliteValue[] = []) =>
    query.includes("e.vat_amount") ? sqlite.current!.prepare(query).all(...bindings) : [],
}));

import { buildUstvaReport } from "./ustva";

const QUARTER_1_2026_ISSUE_DATE = Math.floor(new Date(2026, 1, 10).getTime() / 1000);

function seedExpense(vatAmount: number, status = "open"): void {
  sqlite
    .current!.prepare(
      "INSERT INTO expenses (status, is_reverse_charge, issue_date, vat_amount) VALUES (?, 0, ?, ?)",
    )
    .run(status, QUARTER_1_2026_ISSUE_DATE, vatAmount);
}

async function kz66(): Promise<number> {
  const report = await buildUstvaReport(2026, 1, "accrual");
  return report.rows.find((r) => r.kz === "66")!.amount;
}

beforeEach(() => {
  sqlite.current = new DatabaseSync(":memory:") as SqliteDatabase;
  sqlite.current.exec(
    `CREATE TABLE expenses (
       id INTEGER PRIMARY KEY, status TEXT, is_reverse_charge INTEGER, issue_date INTEGER, vat_amount INTEGER)`,
  );
});

describe("Kennzahl 66 against the database", () => {
  it("sums the stored VAT of a negative half-cent line instead of re-rounding it", async () => {
    // A -2,50 EUR line at 19 % has VAT of -0,475 EUR; the app stores -47 ct (half-up),
    // while SQL ROUND(-47.5) would give -48 ct.
    seedExpense(-47);

    expect(await kz66()).toBe(-47);
  });

  it("ignores cancelled expenses", async () => {
    seedExpense(1_900);
    seedExpense(5_000, "cancelled");

    expect(await kz66()).toBe(1_900);
  });
});
