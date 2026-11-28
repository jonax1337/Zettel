import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadKpis, openInvoiceRows } from "$lib/dashboard/queries";
import { periodForYear } from "$lib/dashboard/period";
import { SECONDS_PER_DAY, toUnix } from "$lib/utils/date";
import { migratedDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { EMPTY_INVOICE_FIGURES, loadCustomerListFigures, loadCustomerOverview } from "./customer-overview";

const YEAR = periodForYear(2026);
const ACME = 1;
const SOLO = 2;
const EMPTY = 3;

const day = (month: number, date: number, year = 2026) => toUnix(new Date(year, month - 1, date));

type InvoiceSeed = {
  customerId?: number;
  number: string;
  status?: string;
  issueDate?: number;
  subtotal?: number;
  vat?: number;
  isCreditNote?: boolean;
  correctsInvoiceId?: number;
  amountPaid?: number;
  paidAt?: number;
  currency?: string;
  eurTotal?: number;
};

function seedInvoice(seed: InvoiceSeed): number {
  const subtotal = seed.subtotal ?? 10_000;
  const vat = seed.vat ?? Math.round(subtotal * 0.19);
  const issueDate = seed.issueDate ?? day(3, 1);
  const result = sqlite.current!.prepare(
    `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status, subtotal, vat_amount,
                           total, is_credit_note, corrects_invoice_id, amount_paid_cent, paid_at, currency, eur_total_cent)
     VALUES (?, ?, '{}', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    seed.number,
    seed.customerId ?? ACME,
    issueDate,
    issueDate + 14 * SECONDS_PER_DAY,
    seed.status ?? "sent",
    subtotal,
    vat,
    subtotal + vat,
    seed.isCreditNote ? 1 : 0,
    seed.correctsInvoiceId ?? null,
    seed.amountPaid ?? 0,
    seed.paidAt ?? null,
    seed.currency ?? "EUR",
    seed.eurTotal ?? null,
  );
  return Number(result.lastInsertRowid);
}

function seedProject(customerId: number): number {
  const result = sqlite.current!.prepare("INSERT INTO projects (customer_id, name) VALUES (?, 'Projekt')").run(customerId);
  return Number(result.lastInsertRowid);
}

function seedTimeEntry(projectId: number, minutes: number | null, invoiceId: number | null = null) {
  sqlite.current!.prepare(
    "INSERT INTO time_entries (project_id, entry_date, duration_minutes, invoice_id) VALUES (?, ?, ?, ?)",
  ).run(projectId, day(3, 1), minutes, invoiceId);
}

beforeEach(() => {
  sqlite.current = migratedDatabase();
  sqlite.current.exec(`INSERT INTO customers (id, customer_number, name) VALUES
    (1, 'K-0001', 'Acme GmbH'), (2, 'K-0002', 'Solo'), (3, 'K-0003', 'Leer')`);
});

describe("revenue of the year", () => {
  it("counts issued invoices net and leaves out drafts, cancelled invoices and other years", async () => {
    seedInvoice({ number: "RE-1", status: "sent" });
    seedInvoice({ number: "RE-2", status: "partial", subtotal: 20_000 });
    seedInvoice({ number: "RE-3", status: "paid", subtotal: 5_000 });
    seedInvoice({ number: "DRAFT-a", status: "draft", subtotal: 90_000 });
    seedInvoice({ number: "RE-4", status: "cancelled", subtotal: 90_000 });
    seedInvoice({ number: "RE-5", status: "paid", subtotal: 90_000, issueDate: day(12, 20, 2025) });

    const overview = await loadCustomerOverview(ACME, YEAR);

    expect(overview.revenueNet).toBe(35_000);
  });

  it("nets an issued credit note against the invoice", async () => {
    const invoice = seedInvoice({ number: "RE-1", status: "paid", subtotal: 10_000 });
    seedInvoice({ number: "RE-2", status: "sent", subtotal: -4_000, isCreditNote: true, correctsInvoiceId: invoice });

    expect((await loadCustomerOverview(ACME, YEAR)).revenueNet).toBe(6_000);
  });

  it("nets a foreign-currency credit note by its negative frozen EUR amount", async () => {
    // 119,00 USD frozen at 110,00 EUR, credited by half: 59,50 USD frozen at 55,00 EUR.
    const invoice = seedInvoice({ number: "RE-1", currency: "USD", eurTotal: 11_000 });
    seedInvoice({
      number: "RE-2",
      currency: "USD",
      eurTotal: -5_500,
      subtotal: -5_000,
      vat: -950,
      isCreditNote: true,
      correctsInvoiceId: invoice,
    });

    const { revenueNet } = await loadCustomerOverview(ACME, YEAR);

    expect(revenueNet).toBe(4_622);
  });

  it("counts the year in local time: 31 December 23:59 is in, 1 January 00:00 of the next year is out", async () => {
    seedInvoice({ number: "RE-1", subtotal: 1_000, issueDate: toUnix(new Date(2025, 11, 31, 23, 59)) });
    seedInvoice({ number: "RE-2", subtotal: 2_000, issueDate: toUnix(new Date(2026, 0, 1, 0, 0)) });
    seedInvoice({ number: "RE-3", subtotal: 4_000, issueDate: toUnix(new Date(2026, 11, 31, 23, 59)) });
    seedInvoice({ number: "RE-4", subtotal: 8_000, issueDate: toUnix(new Date(2027, 0, 1, 0, 0)) });

    expect((await loadCustomerOverview(ACME, YEAR)).revenueNet).toBe(6_000);
  });

  it("takes a foreign-currency invoice's share of its frozen EUR total", async () => {
    // 100,00 net + 19,00 VAT in USD, frozen at 110,00 EUR gross.
    seedInvoice({ number: "RE-1", currency: "USD", eurTotal: 11_000 });

    const { revenueNet } = await loadCustomerOverview(ACME, YEAR);

    expect(revenueNet).toBe(9_244);
  });

  it("keeps the customers apart", async () => {
    seedInvoice({ number: "RE-1", customerId: ACME, subtotal: 10_000 });
    seedInvoice({ number: "RE-2", customerId: SOLO, subtotal: 2_000 });

    expect((await loadCustomerOverview(SOLO, YEAR)).revenueNet).toBe(2_000);
  });
});

describe("open amount", () => {
  it("subtracts partial payments and ignores paid, draft and cancelled invoices", async () => {
    seedInvoice({ number: "RE-1", status: "partial", amountPaid: 4_000 });
    seedInvoice({ number: "RE-2", status: "sent", subtotal: 1_000, vat: 0 });
    seedInvoice({ number: "RE-3", status: "paid", amountPaid: 11_900 });
    seedInvoice({ number: "DRAFT-a", status: "draft" });
    seedInvoice({ number: "RE-4", status: "cancelled" });

    const overview = await loadCustomerOverview(ACME, YEAR);

    expect(overview.openBalance).toBe(7_900 + 1_000);
    expect(overview.openCount).toBe(2);
  });

  it("counts an invoice of an earlier year, which revenue does not", async () => {
    seedInvoice({ number: "RE-0", issueDate: day(11, 1, 2025) });

    const overview = await loadCustomerOverview(ACME, YEAR);

    expect(overview.openBalance).toBe(11_900);
    expect(overview.revenueNet).toBe(0);
  });

  it("subtracts a partial credit note and drops an invoice a credit note fully offsets", async () => {
    const partlyCredited = seedInvoice({ number: "RE-1" });
    seedInvoice({ number: "RE-2", subtotal: -5_000, vat: -950, isCreditNote: true, correctsInvoiceId: partlyCredited });
    const fullyCredited = seedInvoice({ number: "RE-3" });
    seedInvoice({ number: "RE-4", subtotal: -10_000, vat: -1_900, isCreditNote: true, correctsInvoiceId: fullyCredited });

    const overview = await loadCustomerOverview(ACME, YEAR);

    expect(overview.openBalance).toBe(11_900 - 5_950);
    expect(overview.openCount).toBe(1);
  });

  it("converts the part of a foreign-currency invoice that is paid into EUR proportionally", async () => {
    // 119,00 USD frozen at 110,00 EUR; half of it is paid.
    seedInvoice({ number: "RE-1", status: "partial", currency: "USD", eurTotal: 11_000, amountPaid: 5_950 });

    expect((await loadCustomerOverview(ACME, YEAR)).openBalance).toBe(5_500);
  });
});

describe("average payment time", () => {
  it("averages the days from issue to payment over paid invoices", async () => {
    seedInvoice({ number: "RE-1", status: "paid", issueDate: day(1, 10), paidAt: day(1, 20) });
    seedInvoice({ number: "RE-2", status: "paid", issueDate: day(2, 1), paidAt: day(2, 21) });
    seedInvoice({ number: "RE-3", status: "sent", issueDate: day(2, 1) });

    expect((await loadCustomerOverview(ACME, YEAR)).averagePaymentDays).toBe(15);
  });

  it("counts calendar days when the invoice and the payment carry times of day", async () => {
    seedInvoice({
      number: "RE-1",
      status: "paid",
      issueDate: toUnix(new Date(2026, 2, 20, 23, 30)),
      paidAt: toUnix(new Date(2026, 2, 21, 0, 30)),
    });

    expect((await loadCustomerOverview(ACME, YEAR)).averagePaymentDays).toBe(1);
  });

  it("counts calendar days across the change to summer time", async () => {
    // 35 hours of clock time, because the night of 29 March 2026 has 23.
    seedInvoice({
      number: "RE-1",
      status: "paid",
      issueDate: toUnix(new Date(2026, 2, 28, 18)),
      paidAt: toUnix(new Date(2026, 2, 30, 6)),
    });

    expect((await loadCustomerOverview(ACME, YEAR)).averagePaymentDays).toBe(2);
  });

  it("counts a payment dated before the invoice as zero days", async () => {
    seedInvoice({ number: "RE-1", status: "paid", issueDate: day(5, 10), paidAt: day(5, 1) });

    expect((await loadCustomerOverview(ACME, YEAR)).averagePaymentDays).toBe(0);
  });

  it("leaves out partially paid invoices and credit notes, even with a payment date", async () => {
    seedInvoice({ number: "RE-1", status: "paid", issueDate: day(1, 10), paidAt: day(1, 20) });
    seedInvoice({ number: "RE-2", status: "partial", issueDate: day(1, 10), paidAt: day(3, 10), amountPaid: 5_000 });
    seedInvoice({ number: "RE-3", status: "paid", issueDate: day(1, 10), paidAt: day(4, 10), isCreditNote: true, subtotal: -1_000 });

    expect((await loadCustomerOverview(ACME, YEAR)).averagePaymentDays).toBe(10);
  });

  it("is null without a paid invoice", async () => {
    seedInvoice({ number: "RE-1", status: "sent" });

    expect((await loadCustomerOverview(ACME, YEAR)).averagePaymentDays).toBeNull();
  });
});

describe("unbilled time", () => {
  it("sums finished, unclaimed entries of the customer's projects", async () => {
    const acme = seedProject(ACME);
    const solo = seedProject(SOLO);
    const invoice = seedInvoice({ number: "RE-1" });
    seedTimeEntry(acme, 90);
    seedTimeEntry(acme, 180);
    seedTimeEntry(acme, null);
    seedTimeEntry(acme, 600, invoice);
    seedTimeEntry(solo, 60);

    expect((await loadCustomerOverview(ACME, YEAR)).unbilledMinutes).toBe(270);
  });
});

describe("series", () => {
  it("lists the customer's series with the net amount of one invoice", async () => {
    sqlite.current!.exec(`
      INSERT INTO recurring_invoices (id, name, customer_id, interval, start_date, next_due_date, active)
        VALUES (1, 'Retainer', 1, 'monthly', 1, 1800000000, 1), (2, 'Fremd', 2, 'yearly', 1, 1800000000, 1);
      INSERT INTO recurring_invoice_items (recurring_id, position, description, quantity, unit_price, vat_rate)
        VALUES (1, 1, 'Support', 2, 25000, 19), (1, 2, 'Hosting', 1.5, 1000, 19), (2, 1, 'Wartung', 1, 9900, 19);`);

    const { series } = await loadCustomerOverview(ACME, YEAR);

    expect(series).toEqual([
      { id: 1, name: "Retainer", interval: "monthly", nextDueDate: 1_800_000_000, active: true, netCent: 51_500 },
    ]);
  });
});

describe("last invoice", () => {
  it("is the newest issued invoice, not a credit note, draft or cancelled invoice", async () => {
    const invoice = seedInvoice({ number: "RE-1", issueDate: day(2, 1) });
    seedInvoice({ number: "RE-2", issueDate: day(6, 1), subtotal: -100, isCreditNote: true, correctsInvoiceId: invoice });
    seedInvoice({ number: "DRAFT-a", status: "draft", issueDate: day(7, 1) });
    seedInvoice({ number: "RE-3", status: "cancelled", issueDate: day(8, 1) });

    expect((await loadCustomerOverview(ACME, YEAR)).lastInvoiceDate).toBe(day(2, 1));
  });
});

describe("a customer without documents", () => {
  it("has empty figures", async () => {
    const overview = await loadCustomerOverview(EMPTY, YEAR);

    expect(overview).toEqual({ ...EMPTY_INVOICE_FIGURES, averagePaymentDays: null, unbilledMinutes: 0, series: [] });
  });
});

describe("the list figures", () => {
  it("hold one entry per customer with invoices", async () => {
    seedInvoice({ number: "RE-1", customerId: ACME, subtotal: 10_000, issueDate: day(4, 2) });
    seedInvoice({ number: "RE-2", customerId: SOLO, subtotal: 2_000, status: "paid", issueDate: day(5, 3) });

    const figures = await loadCustomerListFigures(YEAR);

    expect([...figures.keys()].sort()).toEqual([ACME, SOLO]);
    expect(figures.get(ACME)).toEqual({ revenueNet: 10_000, openBalance: 11_900, openCount: 1, lastInvoiceDate: day(4, 2) });
    expect(figures.get(SOLO)).toEqual({ revenueNet: 2_000, openBalance: 0, openCount: 0, lastInvoiceDate: day(5, 3) });
    expect(figures.has(EMPTY)).toBe(false);
  });

  it("round the revenue per customer, so their sum can differ from the overview by a cent", async () => {
    // 119,00 USD frozen at 109,90 EUR: net 92,3529... EUR, which rounds down for each customer on its own.
    seedInvoice({ number: "RE-1", customerId: ACME, currency: "USD", eurTotal: 10_990 });
    seedInvoice({ number: "RE-2", customerId: SOLO, currency: "USD", eurTotal: 10_990 });

    const figures = await loadCustomerListFigures(YEAR);
    const { revenueNet } = await loadKpis(YEAR);

    expect(figures.get(ACME)?.revenueNet).toBe(9_235);
    expect(figures.get(SOLO)?.revenueNet).toBe(9_235);
    expect(revenueNet).toBe(18_471);
  });

  it("add up to the overview's open receivables", async () => {
    const paid = seedInvoice({ number: "RE-1", customerId: ACME, status: "paid" });
    seedInvoice({ number: "RE-2", customerId: ACME, subtotal: -2_000, isCreditNote: true, correctsInvoiceId: paid });
    seedInvoice({ number: "RE-3", customerId: SOLO, status: "partial", amountPaid: 3_000, subtotal: 7_000 });
    seedInvoice({ number: "RE-4", customerId: SOLO, currency: "USD", eurTotal: 11_000 });
    seedInvoice({ number: "RE-5", customerId: ACME, issueDate: day(10, 1, 2025) });
    seedInvoice({ number: "DRAFT-a", customerId: SOLO, status: "draft" });

    const figures = [...(await loadCustomerListFigures(YEAR)).values()];
    const openTotal = (await openInvoiceRows()).reduce((sum, row) => sum + row.balance, 0);

    expect(figures.reduce((sum, f) => sum + f.openBalance, 0)).toBe(openTotal);
  });

  it("add up to the overview's revenue while every amount is in whole cents", async () => {
    const paid = seedInvoice({ number: "RE-1", customerId: ACME, status: "paid" });
    seedInvoice({ number: "RE-2", customerId: ACME, subtotal: -2_000, isCreditNote: true, correctsInvoiceId: paid });
    seedInvoice({ number: "RE-3", customerId: SOLO, status: "partial", subtotal: 7_000 });
    seedInvoice({ number: "RE-4", customerId: ACME, issueDate: day(10, 1, 2025) });
    seedInvoice({ number: "DRAFT-a", customerId: SOLO, status: "draft" });

    const figures = [...(await loadCustomerListFigures(YEAR)).values()];

    expect(figures.reduce((sum, f) => sum + f.revenueNet, 0)).toBe((await loadKpis(YEAR)).revenueNet);
  });
});
