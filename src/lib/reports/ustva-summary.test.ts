import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "$lib/db/sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("$lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/db/client")>()),
  ...(await import("$lib/db/sqlite-test-db")).sqliteClient(sqlite),
}));

import { buildUstvaReport, summarizeUstva, type UstvaReport, type UstvaRow } from "./ustva";

const YEAR = 2026;
const QUARTER = 4;

function db(): SqliteDatabase {
  return sqlite.current!;
}

function inQuarter(day: number): number {
  return Math.floor(new Date(YEAR, 10, day, 12).getTime() / 1000);
}

type SeedInvoice = {
  number: string;
  day: number;
  items: { rate: number; net: number }[];
  vat: number;
  creditNote?: boolean;
  kleinunternehmer?: boolean;
  currency?: string;
  eurTotalCent?: number;
};

function seedInvoice(invoice: SeedInvoice): void {
  const sign = invoice.creditNote ? -1 : 1;
  const subtotal = invoice.items.reduce((sum, item) => sum + item.net, 0) * sign;
  const vat = invoice.vat * sign;
  const { lastInsertRowid } = db()
    .prepare(
      `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status, subtotal,
                             vat_amount, total, reverse_charge_type, is_reverse_charge, is_credit_note,
                             is_kleinunternehmer, currency, eur_total_cent)
       VALUES (?, 1, '{"name":"Acme GmbH"}', ?, ?, 'sent', ?, ?, ?, 'none', 0, ?, ?, ?, ?)`,
    )
    .run(
      invoice.number,
      inQuarter(invoice.day),
      inQuarter(invoice.day),
      subtotal,
      vat,
      subtotal + vat,
      invoice.creditNote ? 1 : 0,
      invoice.kleinunternehmer ? 1 : 0,
      invoice.currency ?? "EUR",
      invoice.eurTotalCent ?? null,
    );
  invoice.items.forEach((item, position) => {
    db()
      .prepare(
        "INSERT INTO invoice_items (invoice_id, position, description, vat_rate, line_total) VALUES (?, ?, 'Leistung', ?, ?)",
      )
      .run(Number(lastInsertRowid), position, item.rate, item.net);
  });
}

function seedExpense(number: string, net: number, vat: number, reverseCharge = false): void {
  const { lastInsertRowid } = db()
    .prepare(
      `INSERT INTO expenses (internal_number, vendor_id, issue_date, status, subtotal, vat_amount, total, currency,
                             is_reverse_charge, reverse_charge_type)
       VALUES (?, 1, ?, 'open', ?, ?, ?, 'EUR', ?, ?)`,
    )
    .run(number, inQuarter(10), net, vat, net + vat, reverseCharge ? 1 : 0, reverseCharge ? "intra_eu" : "none");
  db()
    .prepare(
      "INSERT INTO expense_items (expense_id, position, description, vat_rate, line_total) VALUES (?, 0, 'Posten', 19, ?)",
    )
    .run(Number(lastInsertRowid), net);
}

beforeEach(() => {
  sqlite.current = migratedDatabase();
  db().exec("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH')");
  db().exec("INSERT INTO vendors (id, vendor_number, name) VALUES (1, 'L-0001', 'Lieferant')");
  db().exec("UPDATE settings SET vat_accounting = 'accrual', is_kleinunternehmer = 0 WHERE id = 1");
});

describe("summarizeUstva on a migrated database", () => {
  function seedQuarter(): void {
    // 19 %: 10.000,50 EUR, less a credit note of 1.000 EUR, plus a USD invoice worth 920 EUR net.
    seedInvoice({ number: "RE-19", day: 3, items: [{ rate: 19, net: 1_000_050 }], vat: 190_010 });
    seedInvoice({ number: "GS-19", day: 5, items: [{ rate: 19, net: 100_000 }], vat: 19_000, creditNote: true });
    seedInvoice({
      number: "RE-USD",
      day: 7,
      items: [{ rate: 19, net: 100_000 }],
      vat: 19_000,
      currency: "USD",
      eurTotalCent: 109_480,
    });
    // 7 %: 2.000,99 EUR.
    seedInvoice({ number: "RE-7", day: 9, items: [{ rate: 7, net: 200_099 }], vat: 14_007 });
    seedExpense("EX-1", 21_000, 4_000);
    // A § 13b expense feeds Kennzahl 46, never the deductible input VAT.
    seedExpense("EX-RC", 50_000, 9_500, true);
  }

  it("derives Umsatzsteuer, Vorsteuer and Zahllast from the truncated bases", async () => {
    seedQuarter();
    const report = await buildUstvaReport(YEAR, QUARTER, "accrual");

    // 19 %: 1.000.050 - 100.000 + 92.000 = 992.050, truncated to 992.000; 7 %: 200.099 truncated to 200.000.
    expect(summarizeUstva(report, false)).toEqual({
      kind: "computed",
      outputVatCent: 188_480 + 14_000,
      inputVatCent: 4_000,
      payableCent: 188_480 + 14_000 - 4_000,
    });
    expect(report.rows.find((row) => row.kz === "46")!.amount).toBe(50_000);
  });

  it("reports a refund as a negative payable amount", async () => {
    seedExpense("EX-BIG", 100_000, 19_000);
    const report = await buildUstvaReport(YEAR, QUARTER, "accrual");

    expect(summarizeUstva(report, false)).toMatchObject({ kind: "computed", payableCent: -19_000 });
  });

  it("has no Zahllast for a Kleinunternehmer, although input VAT was recorded", async () => {
    seedInvoice({ number: "RE-KU", day: 3, items: [{ rate: 0, net: 500_000 }], vat: 0, kleinunternehmer: true });
    seedExpense("EX-1", 21_000, 4_000);
    db().exec("UPDATE settings SET is_kleinunternehmer = 1 WHERE id = 1");
    const report = await buildUstvaReport(YEAR, QUARTER, "accrual");

    expect(report.rows.find((row) => row.kz === "66")!.amount).toBe(4_000);
    expect(summarizeUstva(report, true)).toEqual({ kind: "kleinunternehmer" });
  });
});

describe("summarizeUstva", () => {
  function row(kz: string, amount: number): UstvaRow {
    return { kz, label: kz, amount, wholeEuros: kz !== "66", computedFrom: "" };
  }
  function report(rows: UstvaRow[]): UstvaReport {
    return { year: YEAR, quarter: QUARTER, dateFrom: 0, dateTo: 0, vatAccounting: "accrual", rows };
  }

  it("applies 19 % and 7 % to the whole-euro bases and subtracts the input VAT", () => {
    const summary = summarizeUstva(report([row("81", 452_000), row("86", 100_000), row("66", 14_155)]), false);
    expect(summary).toEqual({ kind: "computed", outputVatCent: 85_880 + 7_000, inputVatCent: 14_155, payableCent: 92_880 - 14_155 });
  });

  it("ignores the § 13b and tax-free bases", () => {
    const summary = summarizeUstva(report([row("81", 10_000), row("86", 0), row("46", 999_900), row("41", 555_500), row("66", 0)]), false);
    expect(summary).toMatchObject({ outputVatCent: 1_900 });
  });

  it("refuses to compute when a Kennzahl is missing instead of counting it as zero", () => {
    expect(() => summarizeUstva(report([row("81", 10_000), row("86", 0)]), false)).toThrow("66");
  });

  it("needs no Kennzahlen for a Kleinunternehmer", () => {
    expect(summarizeUstva(report([]), true)).toEqual({ kind: "kleinunternehmer" });
  });
});
