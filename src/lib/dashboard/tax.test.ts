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
    sqlite.current!.prepare(query).all(...bindings),
}));
vi.mock("$lib/db/tax-prepayments", () => ({ sumPrepaymentsForYear: async () => 0 }));
vi.mock("$lib/db/queries", () => ({
  loadSettings: async () => ({
    isKleinunternehmer: false,
    taxReserveExpensesGross: false,
    otherIncomeAnnualCent: 0,
    legalForm: "freelancer",
    taxFilingStatus: "single",
    churchTaxRate: 0,
    tradeTaxRate: 4,
    pauschalTaxPercent: 30,
    usePauschalTaxReserve: false,
  }),
}));

import { fromIsoDate } from "$lib/utils/date";
import { computeTaxRücklage } from "./tax";

const PAST_YEAR = 2023;
const ISSUED_IN_YEAR = fromIsoDate("2023-03-15");

type InvoiceSeed = {
  subtotal: number;
  vatAmount: number;
  total: number;
  eurTotalCent?: number | null;
};

function seedInvoice(inv: InvoiceSeed): void {
  sqlite
    .current!.prepare(
      `INSERT INTO invoices (status, issue_date, subtotal, vat_amount, total, eur_total_cent)
       VALUES ('sent', ?, ?, ?, ?, ?)`,
    )
    .run(ISSUED_IN_YEAR, inv.subtotal, inv.vatAmount, inv.total, inv.eurTotalCent ?? null);
}

beforeEach(() => {
  sqlite.current = new DatabaseSync(":memory:") as SqliteDatabase;
  sqlite.current.exec(`
    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY, status TEXT, issue_date INTEGER,
      subtotal INTEGER, vat_amount INTEGER, total INTEGER, eur_total_cent INTEGER);
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY, status TEXT, issue_date INTEGER,
      subtotal INTEGER, total INTEGER, vat_amount INTEGER, is_reverse_charge INTEGER)`);
});

describe("computeTaxRücklage currency handling", () => {
  it("counts a USD invoice by its frozen EUR value, not by its USD cents", async () => {
    // 1.000,00 USD net + 190,00 USD VAT, frozen as 920,00 EUR gross => 773,11 EUR net, 146,89 EUR VAT
    seedInvoice({ subtotal: 100_000, vatAmount: 19_000, total: 119_000, eurTotalCent: 92_000 });

    const result = await computeTaxRücklage(PAST_YEAR);

    expect(result.revenueYtdGrossCent).toBe(92_000);
    expect(result.ustSchuldYtdCent).toBe(14_689);
    expect(result.profitYtdCent).toBe(77_311);
  });

  it("derives the Pauschal reserve from EUR gross revenue", async () => {
    seedInvoice({ subtotal: 100_000, vatAmount: 19_000, total: 119_000, eurTotalCent: 92_000 });

    const result = await computeTaxRücklage(PAST_YEAR);

    expect(result.pauschalReserveCent).toBe(27_600);
  });

  it("leaves EUR invoices without a frozen total unchanged", async () => {
    seedInvoice({ subtotal: 100_000, vatAmount: 19_000, total: 119_000 });

    const result = await computeTaxRücklage(PAST_YEAR);

    expect(result.revenueYtdGrossCent).toBe(119_000);
    expect(result.ustSchuldYtdCent).toBe(19_000);
    expect(result.profitYtdCent).toBe(100_000);
  });
});
