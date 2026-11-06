import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "$lib/db/sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("$lib/db/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/db/client")>()),
  ...(await import("$lib/db/sqlite-test-db")).sqliteClient(sqlite),
}));

import { loadKpis } from "$lib/dashboard/queries";
import { periodForQuarter, periodForYear, type Quarter } from "$lib/dashboard/period";
import { listCategories, setCategoryEuerKz } from "$lib/db/expense-categories";
import { buildEuerReport } from "./euer-load";
import { buildUstvaReport } from "./ustva";
import { cashBasisNetByRate, loadCashBasisRows } from "./ustva-cash";

const YEAR = 2026;
const QUARTERS: Quarter[] = [1, 2, 3, 4];

function at(month: number, day: number): number {
  return Math.floor(new Date(YEAR, month - 1, day, 12).getTime() / 1000);
}

function db(): SqliteDatabase {
  return sqlite.current!;
}

type SeedInvoice = {
  number: string;
  issuedAt: number;
  paidAt: number;
  items: { rate: number; net: number }[];
  vat: number;
  reverseCharge?: "intra_eu";
};

function seedPaidInvoice(invoice: SeedInvoice): number {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.net, 0);
  const total = subtotal + invoice.vat;
  const { lastInsertRowid } = db()
    .prepare(
      `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status, subtotal,
                             vat_amount, total, reverse_charge_type, is_reverse_charge, currency)
       VALUES (?, 1, '{"name":"Acme GmbH"}', ?, ?, 'paid', ?, ?, ?, ?, ?, 'EUR')`,
    )
    .run(
      invoice.number,
      invoice.issuedAt,
      invoice.issuedAt,
      subtotal,
      invoice.vat,
      total,
      invoice.reverseCharge ?? "none",
      invoice.reverseCharge ? 1 : 0,
    );
  const id = Number(lastInsertRowid);
  invoice.items.forEach((item, position) => {
    db()
      .prepare(
        `INSERT INTO invoice_items (invoice_id, position, description, vat_rate, line_total) VALUES (?, ?, 'Leistung', ?, ?)`,
      )
      .run(id, position, item.rate, item.net);
  });
  db().prepare("INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent) VALUES (?, ?, ?)").run(id, invoice.paidAt, total);
  return id;
}

function categoryId(name: string): number {
  const [row] = db().prepare("SELECT id FROM expense_categories WHERE name = ?").all(name) as { id: number }[];
  return row.id;
}

type SeedExpense = {
  number: string;
  issuedAt: number;
  paidAt: number;
  items: { category: string | null; net: number }[];
  vat: number;
  reverseCharge?: boolean;
};

function seedPaidExpense(expense: SeedExpense): void {
  const subtotal = expense.items.reduce((sum, item) => sum + item.net, 0);
  const { lastInsertRowid } = db()
    .prepare(
      `INSERT INTO expenses (internal_number, vendor_id, issue_date, paid_date, status, subtotal, vat_amount, total,
                             currency, is_reverse_charge, reverse_charge_type)
       VALUES (?, 1, ?, ?, 'paid', ?, ?, ?, 'EUR', ?, ?)`,
    )
    .run(
      expense.number,
      expense.issuedAt,
      expense.paidAt,
      subtotal,
      expense.vat,
      subtotal + expense.vat,
      expense.reverseCharge ? 1 : 0,
      expense.reverseCharge ? "intra_eu" : "none",
    );
  expense.items.forEach((item, position) => {
    db()
      .prepare(
        `INSERT INTO expense_items (expense_id, position, description, category_id, vat_rate, line_total) VALUES (?, ?, 'Posten', ?, 19, ?)`,
      )
      .run(Number(lastInsertRowid), position, item.category === null ? null : categoryId(item.category), item.net);
  });
}

function seedYear(): void {
  seedPaidInvoice({ number: "RE-1", issuedAt: at(2, 5), paidAt: at(2, 20), items: [{ rate: 19, net: 10_000 }], vat: 1_900 });
  seedPaidInvoice({
    number: "RE-2",
    issuedAt: at(5, 3),
    paidAt: at(5, 20),
    items: [
      { rate: 7, net: 4_000 },
      { rate: 19, net: 1_001 },
    ],
    vat: 280 + 190,
  });
  seedPaidInvoice({
    number: "RE-3",
    issuedAt: at(8, 2),
    paidAt: at(8, 15),
    items: [{ rate: 0, net: 8_000 }],
    vat: 0,
    reverseCharge: "intra_eu",
  });
  seedPaidExpense({
    number: "EX-1",
    issuedAt: at(3, 10),
    paidAt: at(3, 12),
    items: [
      { category: "Software / SaaS", net: 2_000 },
      { category: "Reisekosten", net: 1_000 },
      { category: null, net: 500 },
    ],
    vat: 665,
  });
  seedPaidExpense({
    number: "EX-2",
    issuedAt: at(9, 1),
    paidAt: at(9, 4),
    items: [{ category: "Software / SaaS", net: 3_000 }],
    vat: 0,
    reverseCharge: true,
  });
}

function amountOf(report: Awaited<ReturnType<typeof buildEuerReport>>, kz: string): number | null {
  return report.lines.find((line) => line.kz === kz)!.amountCent;
}

beforeEach(() => {
  sqlite.current = migratedDatabase();
  db().exec("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH')");
  db().exec("INSERT INTO vendors (id, vendor_number, name) VALUES (1, 'L-0001', 'Lieferant')");
  db().exec("UPDATE settings SET vat_accounting = 'cash', is_kleinunternehmer = 0 WHERE id = 1");
});

describe("buildEuerReport on a migrated database", () => {
  it("books the seeded year by payment date with the category mapping", async () => {
    seedYear();
    const report = await buildEuerReport(YEAR);

    expect(amountOf(report, "112")).toBe(10_000 + 5_001);
    expect(amountOf(report, "103")).toBe(8_000);
    expect(amountOf(report, "140")).toBe(1_900 + 470);
    expect(amountOf(report, "228")).toBe(2_000 + 3_000);
    expect(amountOf(report, "221")).toBe(1_000);
    expect(amountOf(report, "183")).toBe(500);
    expect(amountOf(report, "185")).toBe(665);
    expect(report.formYearExact).toBe(true);
  });

  it("ignores payments and expenses outside the year", async () => {
    seedYear();
    const report = await buildEuerReport(YEAR + 1);

    expect(report.lines.every((line) => line.amountCent === null)).toBe(true);
  });

  it("books Kleinunternehmer expenses gross", async () => {
    seedYear();
    db().exec("UPDATE settings SET is_kleinunternehmer = 1 WHERE id = 1");
    const report = await buildEuerReport(YEAR);

    expect(amountOf(report, "185")).toBeNull();
    expect(amountOf(report, "221")).toBe(1_190);
  });

  // Holds only because every document is paid in the year it was issued: the UStVA
  // and the tax report look at other dates (Ist-Versteuerung, issue date) otherwise.
  it("matches UStVA, tax report and EÜR when all documents are paid in the year they were issued", async () => {
    seedYear();
    const report = await buildEuerReport(YEAR);

    let netTaxable = 0;
    let inputVat = 0;
    for (const quarter of QUARTERS) {
      const { start, end } = periodForQuarter(YEAR, quarter);
      const netByRate = cashBasisNetByRate(await loadCashBasisRows(start, end - 1));
      netTaxable += (netByRate.get(19) ?? 0) + (netByRate.get(7) ?? 0);
      const ustva = await buildUstvaReport(YEAR, quarter, "cash");
      inputVat += ustva.rows.find((row) => row.kz === "66")!.amount;
    }
    const { revenueNet } = await loadKpis(periodForYear(YEAR));

    expect(amountOf(report, "112")).toBe(netTaxable);
    expect(amountOf(report, "112")! + amountOf(report, "103")!).toBe(revenueNet);
    expect(amountOf(report, "185")).toBe(inputVat);
  });
});

describe("expense category mapping (migration 0030)", () => {
  it("maps the built-in categories to their Kennzahl", async () => {
    const mapping = Object.fromEntries((await listCategories()).map((c) => [c.name, c.euerKz]));

    expect(mapping).toEqual({
      "Software / SaaS": "228",
      "Hardware (Sofortabschreibung GWG)": "132",
      "Telefon / Internet": "280",
      Reisekosten: "221",
      Fortbildung: "281",
      Bürobedarf: "229",
      "Honorare / Subunternehmer": "110",
      "Werbung / Marketing": "224",
      Bankgebühren: "183",
      "Sonstige Betriebsausgaben": "183",
    });
  });

  it("moves the expenses of a category to the newly chosen Kennzahl", async () => {
    seedYear();
    await setCategoryEuerKz(categoryId("Software / SaaS"), "229");
    const report = await buildEuerReport(YEAR);

    expect(amountOf(report, "228")).toBeNull();
    expect(amountOf(report, "229")).toBe(5_000);
  });

  it("falls back to Kz 183 when the mapping is cleared", async () => {
    seedYear();
    await setCategoryEuerKz(categoryId("Software / SaaS"), null);
    const report = await buildEuerReport(YEAR);

    expect(amountOf(report, "228")).toBeNull();
    expect(amountOf(report, "183")).toBe(500 + 5_000);
  });
});
