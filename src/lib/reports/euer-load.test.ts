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

function at(month: number, day: number, year = YEAR): number {
  return Math.floor(new Date(year, month - 1, day, 12).getTime() / 1000);
}

function db(): SqliteDatabase {
  return sqlite.current!;
}

type SeedPayment = { paidAt: number; amountCent: number };

type SeedInvoice = {
  number: string;
  issuedAt: number;
  /** Date of the single payment of the full amount; ignored when `payments` is given. */
  paidAt?: number;
  payments?: SeedPayment[];
  items: { rate: number; net: number }[];
  vat: number;
  reverseCharge?: "intra_eu";
  creditNote?: boolean;
  kleinunternehmer?: boolean;
  currency?: string;
  eurTotalCent?: number;
};

function seedPaidInvoice(invoice: SeedInvoice): number {
  // Credit notes mirror the positive line items; only the header amounts are negated.
  const sign = invoice.creditNote ? -1 : 1;
  const itemsNet = invoice.items.reduce((sum, item) => sum + item.net, 0);
  const subtotal = itemsNet * sign;
  const vat = invoice.vat * sign;
  const total = subtotal + vat;
  const { lastInsertRowid } = db()
    .prepare(
      `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status, subtotal,
                             vat_amount, total, reverse_charge_type, is_reverse_charge, is_credit_note,
                             is_kleinunternehmer, currency, eur_total_cent)
       VALUES (?, 1, '{"name":"Acme GmbH"}', ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      invoice.number,
      invoice.issuedAt,
      invoice.issuedAt,
      subtotal,
      vat,
      total,
      invoice.reverseCharge ?? "none",
      invoice.reverseCharge ? 1 : 0,
      invoice.creditNote ? 1 : 0,
      invoice.kleinunternehmer ? 1 : 0,
      invoice.currency ?? "EUR",
      invoice.eurTotalCent ?? null,
    );
  const id = Number(lastInsertRowid);
  invoice.items.forEach((item, position) => {
    db()
      .prepare(
        `INSERT INTO invoice_items (invoice_id, position, description, vat_rate, line_total) VALUES (?, ?, 'Leistung', ?, ?)`,
      )
      .run(id, position, item.rate, item.net);
  });
  const payments = invoice.payments ?? [{ paidAt: invoice.paidAt ?? invoice.issuedAt, amountCent: Math.abs(total) }];
  for (const payment of payments) {
    db()
      .prepare("INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent) VALUES (?, ?, ?)")
      .run(id, payment.paidAt, payment.amountCent);
  }
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

// The payments query bounds only the end of the period. Cutting off earlier payments as well would
// turn the cumulative per-year shares into a sum that no longer equals the invoice.
describe("buildEuerReport invoice income by payment date", () => {
  const PREVIOUS_YEAR = YEAR - 1;

  it("splits a partial payment across two years into the share paid in each", async () => {
    seedPaidInvoice({
      number: "RE-SPLIT",
      issuedAt: at(12, 1, PREVIOUS_YEAR),
      payments: [
        { paidAt: at(12, 20, PREVIOUS_YEAR), amountCent: 5_950 },
        { paidAt: at(1, 10), amountCent: 5_950 },
      ],
      items: [{ rate: 19, net: 10_000 }],
      vat: 1_900,
    });

    const previous = await buildEuerReport(PREVIOUS_YEAR);
    const current = await buildEuerReport(YEAR);

    expect([amountOf(previous, "112"), amountOf(previous, "140")]).toEqual([5_000, 950]);
    expect([amountOf(current, "112"), amountOf(current, "140")]).toEqual([5_000, 950]);
  });

  it("adds uneven partial payments of mixed VAT rates up to exactly the invoice", async () => {
    seedPaidInvoice({
      number: "RE-UNEVEN",
      issuedAt: at(12, 1, PREVIOUS_YEAR),
      payments: [
        { paidAt: at(12, 20, PREVIOUS_YEAR), amountCent: 1_679 },
        { paidAt: at(1, 10), amountCent: 3_358 },
      ],
      items: [
        { rate: 19, net: 3_333 },
        { rate: 7, net: 1_001 },
      ],
      vat: 633 + 70,
    });

    const reports = [await buildEuerReport(PREVIOUS_YEAR), await buildEuerReport(YEAR)];

    expect(reports.reduce((sum, r) => sum + amountOf(r, "112")!, 0)).toBe(4_334);
    expect(reports.reduce((sum, r) => sum + amountOf(r, "140")!, 0)).toBe(703);
  });

  it("does not book a payment after the invoice was settled in an earlier year", async () => {
    seedPaidInvoice({
      number: "RE-OVERPAID",
      issuedAt: at(11, 1, PREVIOUS_YEAR),
      payments: [
        { paidAt: at(11, 20, PREVIOUS_YEAR), amountCent: 11_900 },
        { paidAt: at(2, 1), amountCent: 500 },
      ],
      items: [{ rate: 19, net: 10_000 }],
      vat: 1_900,
    });

    const report = await buildEuerReport(YEAR);

    for (const kz of ["112", "140", "159"]) expect(amountOf(report, kz)).toBeNull();
    expect(report.warnings).toEqual([
      "1 Rechnung mit Überzahlung – der überschüssige Betrag ist nicht enthalten: RE-OVERPAID",
    ]);
  });

  it("books the refund of a credit note as negative income", async () => {
    seedPaidInvoice({
      number: "ST-1",
      issuedAt: at(4, 1),
      payments: [{ paidAt: at(5, 1), amountCent: 11_900 }],
      items: [{ rate: 19, net: 10_000 }],
      vat: 1_900,
      creditNote: true,
    });

    const report = await buildEuerReport(YEAR);

    expect([amountOf(report, "112"), amountOf(report, "140"), amountOf(report, "159")]).toEqual([
      -10_000, -1_900, -11_900,
    ]);
  });

  it("books a Kleinunternehmer invoice gross on Kz 111", async () => {
    seedPaidInvoice({
      number: "RE-KU",
      issuedAt: at(3, 1),
      paidAt: at(3, 10),
      items: [{ rate: 0, net: 5_000 }],
      vat: 0,
      kleinunternehmer: true,
    });

    const report = await buildEuerReport(YEAR);

    expect(amountOf(report, "111")).toBe(5_000);
    expect(amountOf(report, "112")).toBeNull();
    expect(amountOf(report, "140")).toBeNull();
  });

  it("converts a foreign-currency invoice via its frozen EUR total", async () => {
    seedPaidInvoice({
      number: "RE-USD",
      issuedAt: at(3, 1),
      paidAt: at(3, 10),
      items: [{ rate: 19, net: 10_000 }],
      vat: 1_900,
      currency: "USD",
      eurTotalCent: 11_000,
    });

    const report = await buildEuerReport(YEAR);

    expect([amountOf(report, "112"), amountOf(report, "140")]).toEqual([9_244, 1_756]);
    expect(report.warnings).toEqual([]);
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
