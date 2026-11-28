import { describe, expect, it } from "vitest";
import {
  expenseSummary,
  formatTotals,
  invoiceSummary,
  offerSummary,
  openInvoiceSummary,
  reminderSummary,
  sumByCurrency,
  type InvoiceSummaryRow,
} from "./list-summary";

const NOW = 1_800_000_000;
const DAY = 86_400;

// Amounts are formatted with a non-breaking space before the currency sign.
const plain = (text: string | undefined) => text?.replace(/\u00a0/g, " ");

function invoice(overrides: Partial<InvoiceSummaryRow> = {}): InvoiceSummaryRow {
  return {
    status: "sent",
    isCreditNote: false,
    number: "RE-2026-0001",
    amountPaidCent: 0,
    dueDate: NOW + 10 * DAY,
    total: 100_00,
    currency: "EUR",
    creditedCent: 0,
    settledByCreditNote: false,
    ...overrides,
  };
}

const segment = (rows: InvoiceSummaryRow[], label: string) =>
  plain(invoiceSummary(rows, NOW).find((s) => s.label === label)?.value);

describe("sumByCurrency and formatTotals", () => {
  it("keeps one sum per currency, euro first", () => {
    const totals = sumByCurrency([
      { currency: "USD", cents: 5_00 },
      { currency: "EUR", cents: 10_00 },
      { currency: "EUR", cents: 2_50 },
    ]);
    expect(plain(formatTotals(totals))).toBe("12,50 € + 5,00 $");
  });

  it("shows zero euros for nothing to sum", () => {
    expect(plain(formatTotals(new Map()))).toBe("0,00 €");
  });
});

describe("invoiceSummary", () => {
  it("counts the rows with the right plural", () => {
    expect(invoiceSummary([invoice()], NOW)[0].label).toBe("1 Rechnung");
    expect(invoiceSummary([invoice(), invoice()], NOW)[0].label).toBe("2 Rechnungen");
  });

  it("nets a credit note against its invoice", () => {
    const rows = [invoice({ total: 500_00 }), invoice({ isCreditNote: true, status: "sent", total: -200_00 })];
    expect(segment(rows, "Summe")).toBe("300,00 €");
  });

  it("counts only the open balance of a partly paid invoice", () => {
    const rows = [invoice({ status: "partial", total: 1_000_00, amountPaidCent: 400_00 })];
    expect(segment(rows, "davon offen")).toBe("600,00 €");
  });

  it("leaves drafts, paid invoices, credit notes and invoices settled by credit note out of the open amount", () => {
    const rows = [
      invoice({ status: "draft", total: 10_00 }),
      invoice({ status: "paid", total: 20_00, amountPaidCent: 20_00 }),
      invoice({ isCreditNote: true, total: -30_00 }),
      invoice({ total: 40_00, creditedCent: 40_00, settledByCreditNote: true }),
    ];
    expect(segment(rows, "davon offen")).toBe("0,00 €");
  });

  it("deducts credit notes that only partly reverse an invoice", () => {
    expect(segment([invoice({ total: 100_00, creditedCent: 30_00 })], "davon offen")).toBe("70,00 €");
  });

  it("does not mix currencies", () => {
    const rows = [invoice({ total: 100_00 }), invoice({ total: 50_00, currency: "USD" })];
    expect(segment(rows, "Summe")).toBe("100,00 € + 50,00 $");
  });

  it("adds an overdue segment only when something is overdue", () => {
    expect(segment([invoice()], "davon überfällig")).toBeUndefined();
    const late = invoice({ total: 80_00, dueDate: NOW - DAY });
    expect(segment([invoice(), late], "davon überfällig")).toBe("80,00 €");
  });
});

describe("openInvoiceSummary", () => {
  const labelsOf = (rows: InvoiceSummaryRow[]) => openInvoiceSummary(rows, NOW).map((s) => s.label);

  it("shows count and open amount instead of repeating the sum", () => {
    const rows = [invoice({ status: "partial", total: 1_000_00, amountPaidCent: 400_00 })];
    const segments = openInvoiceSummary(rows, NOW);
    expect(segments.map((s) => s.label)).toEqual(["1 Rechnung", "offen"]);
    expect(plain(segments[1].value)).toBe("600,00 €");
  });

  it("adds the overdue amount when something is overdue", () => {
    const rows = [invoice(), invoice({ total: 80_00, dueDate: NOW - DAY })];
    expect(labelsOf(rows)).toEqual(["2 Rechnungen", "offen", "davon überfällig"]);
    expect(plain(openInvoiceSummary(rows, NOW)[2].value)).toBe("80,00 €");
  });
});

describe("offerSummary", () => {
  it("treats sent offers as open", () => {
    const rows = [
      { status: "sent", total: 100_00, currency: "EUR" },
      { status: "accepted", total: 200_00, currency: "EUR" },
      { status: "draft", total: 50_00, currency: "EUR" },
    ] as const;
    const segments = offerSummary([...rows]);
    expect(segments.map((s) => s.label)).toEqual(["3 Angebote", "Summe", "offen"]);
    expect(plain(segments[1].value)).toBe("350,00 €");
    expect(plain(segments[2].value)).toBe("100,00 €");
  });
});

describe("expenseSummary", () => {
  it("treats open expenses as open", () => {
    const segments = expenseSummary([
      { status: "open", total: 46_41 },
      { status: "paid", total: 45_00 },
    ]);
    expect(segments[0].label).toBe("2 Ausgaben");
    expect(plain(segments[1].value)).toBe("91,41 €");
    expect(plain(segments[2].value)).toBe("46,41 €");
  });
});

describe("reminderSummary", () => {
  it("sums what the reminders demand per currency", () => {
    const segments = reminderSummary([
      { totalDueCents: 616_25, currency: "EUR" },
      { totalDueCents: 778_50, currency: "EUR" },
      { totalDueCents: 10_00, currency: "USD" },
    ]);
    expect(segments[0].label).toBe("3 Mahnungen");
    expect(plain(segments[1].value)).toBe("1.394,75 € + 10,00 $");
  });
});
