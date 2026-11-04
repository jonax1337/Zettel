import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, select, createInvoice, loadSettings } = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  createInvoice: vi.fn(),
  loadSettings: vi.fn(),
}));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  execute,
  insert: vi.fn(),
  select,
}));
vi.mock("./invoices", () => ({ createInvoice }));
vi.mock("./queries", () => ({ loadSettings, getCustomer: vi.fn() }));

import {
  convertToInvoice,
  deleteOffer,
  expireDueOffers,
  getOfferYears,
  listOffers,
  mapOffer,
  openOffersStats,
} from "./offers";

const NOW = new Date(2026, 10, 3, 15, 30); // 3 Nov 2026, 15:30 local
const START_OF_TODAY = new Date(2026, 10, 3).getTime() / 1000;
const DAY = 86400;

const offerRow = {
  id: 5,
  number: "AN-2026-0001",
  customer_id: 2,
  customer_snapshot: "{}",
  issue_date: 100,
  valid_until: 200,
  status: "sent",
  subtotal: 10000,
  vat_amount: 1900,
  total: 11900,
  is_kleinunternehmer: 0,
  is_reverse_charge: 1,
  supply_kind: "services",
  notes: "Hinweis",
  intro_text: null,
  pdf_path: null,
  converted_invoice_id: null,
  created_at: 1,
  updated_at: 1,
  sent_at: null,
  accepted_at: null,
  rejected_at: null,
  currency: "USD",
  exchange_rate: "1.08",
  service_period_start: null,
  service_period_end: null,
  skonto_percent: 2,
  skonto_days: 7,
  pdf_language: "en",
};

const itemRow = {
  id: 1,
  offer_id: 5,
  position: 1,
  description: "Beratung",
  quantity: 2,
  unit: "h",
  unit_price: 5000,
  vat_rate: 19,
  line_total: 10000,
  long_description: "lang",
  line_period_start: null,
  line_period_end: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  execute.mockReset();
  select.mockReset();
  createInvoice.mockReset();
  loadSettings.mockReset();
});

describe("mapOffer", () => {
  it("reads the supply kind from the stored row", () => {
    expect(mapOffer({ ...offerRow, supply_kind: "goods" } as never).supplyKind).toBe("goods");
    expect(mapOffer({ ...offerRow, supply_kind: "services" } as never).supplyKind).toBe("services");
  });
});

describe("expireDueOffers", () => {
  it("keeps an offer valid through its last day: only offers valid until before today lapse", async () => {
    execute.mockResolvedValueOnce({ rowsAffected: 2 });

    const expired = await expireDueOffers();

    const [, binds] = execute.mock.calls[0];
    expect(binds).toEqual([START_OF_TODAY]);
    expect(expired).toBe(2);
  });
});

describe("openOffersStats", () => {
  it("counts offers expiring today as expiring soon, up to a week ahead", async () => {
    select
      .mockResolvedValueOnce([
        { total: 10000, currency: "EUR", exchange_rate: null },
        { total: 10000, currency: null, exchange_rate: null },
        { total: 10000, currency: "EUR", exchange_rate: null },
      ])
      .mockResolvedValueOnce([{ c: 1 }]);

    const stats = await openOffersStats();

    const [, binds] = select.mock.calls[1];
    expect(binds).toEqual([START_OF_TODAY, START_OF_TODAY + 7 * DAY]);
    expect(stats).toEqual({ count: 3, total: 30000, unconvertedCount: 0, expiringSoonCount: 1 });
  });

  it("sums foreign-currency offers in EUR and skips those without a usable rate", async () => {
    select
      .mockResolvedValueOnce([
        { total: 10000, currency: "EUR", exchange_rate: null },
        { total: 10800, currency: "USD", exchange_rate: "1.08" },
        { total: 5000, currency: "USD", exchange_rate: null },
      ])
      .mockResolvedValueOnce([{ c: 0 }]);

    const stats = await openOffersStats();

    expect(stats.count).toBe(3);
    expect(stats.total).toBe(20000);
    expect(stats.unconvertedCount).toBe(1);
  });
});

describe("listOffers", () => {
  it("combines all filters into one parameterized WHERE clause", async () => {
    select.mockResolvedValueOnce([]);

    await listOffers({ status: "sent", customerId: 4, year: 2026, search: " AN-1 " });

    const [sql, binds] = select.mock.calls[0];
    expect(sql).toContain(
      "WHERE o.status = ? AND o.customer_id = ? AND o.issue_date >= ? AND o.issue_date < ? AND (o.number LIKE ? OR c.name LIKE ?)",
    );
    expect(binds).toEqual([
      "sent",
      4,
      new Date(2026, 0, 1).getTime() / 1000,
      new Date(2027, 0, 1).getTime() / 1000,
      "%AN-1%",
      "%AN-1%",
    ]);
  });

  it("applies no WHERE clause for the 'all' filters", async () => {
    select.mockResolvedValueOnce([]);

    await listOffers({ status: "all", customerId: "all", year: "all", search: "  " });

    expect(select.mock.calls[0][0]).not.toContain("WHERE");
  });
});

describe("getOfferYears", () => {
  it("groups by local year, matching the local-time year filter of the list", async () => {
    select.mockResolvedValueOnce([{ y: 2026 }, { y: 2025 }]);

    await expect(getOfferYears()).resolves.toEqual([2026, 2025]);

    expect(select.mock.calls[0][0]).toContain("'localtime'");
  });
});

describe("deleteOffer", () => {
  it.each(["draft", "rejected", "expired"])("deletes %s offers", async (status) => {
    select.mockResolvedValueOnce([{ ...offerRow, status }]).mockResolvedValueOnce([]);

    await deleteOffer(5);

    expect(execute).toHaveBeenCalledWith("DELETE FROM offers WHERE id = ?", [5]);
  });

  it.each(["sent", "accepted"])("refuses to delete %s offers", async (status) => {
    select.mockResolvedValueOnce([{ ...offerRow, status }]).mockResolvedValueOnce([]);

    await expect(deleteOffer(5)).rejects.toThrow("Nur Entwürfe");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("convertToInvoice", () => {
  it("copies offer data into a draft invoice due after the payment terms and links it back", async () => {
    select.mockResolvedValueOnce([offerRow]).mockResolvedValueOnce([itemRow]);
    loadSettings.mockResolvedValueOnce({ defaultPaymentTermsDays: 14 });
    createInvoice.mockResolvedValueOnce(77);

    const invoiceId = await convertToInvoice(5);

    const issueDate = Math.floor(NOW.getTime() / 1000);
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 2,
        issueDate,
        dueDate: issueDate + 14 * DAY,
        reverseChargeType: "intra_eu",
        supplyKind: "services",
        currency: "USD",
        exchangeRate: "1.08",
        skontoPercent: 2,
        skontoDays: 7,
        pdfLanguage: "en",
        items: [expect.objectContaining({ description: "Beratung", quantity: 2, unitPrice: 5000, longDescription: "lang" })],
      }),
    );
    expect(execute.mock.calls[0][1]).toEqual([77, 5]);
    expect(invoiceId).toBe(77);
  });

  it("hands the supply kind of the offer to the invoice", async () => {
    select.mockResolvedValueOnce([{ ...offerRow, supply_kind: "goods" }]).mockResolvedValueOnce([itemRow]);
    loadSettings.mockResolvedValueOnce({ defaultPaymentTermsDays: 14 });
    createInvoice.mockResolvedValueOnce(77);

    await convertToInvoice(5);

    expect(createInvoice.mock.calls[0][0].supplyKind).toBe("goods");
  });

  it("prefers an explicit payment term over the default", async () => {
    select.mockResolvedValueOnce([offerRow]).mockResolvedValueOnce([itemRow]);
    loadSettings.mockResolvedValueOnce({ defaultPaymentTermsDays: 14 });
    createInvoice.mockResolvedValueOnce(77);

    await convertToInvoice(5, { paymentTermsDays: 30 });

    const issueDate = Math.floor(NOW.getTime() / 1000);
    expect(createInvoice.mock.calls[0][0].dueDate).toBe(issueDate + 30 * DAY);
  });

  it("refuses already converted and rejected offers", async () => {
    select.mockResolvedValueOnce([{ ...offerRow, converted_invoice_id: 9 }]).mockResolvedValueOnce([]);
    await expect(convertToInvoice(5)).rejects.toThrow("bereits");

    select.mockResolvedValueOnce([{ ...offerRow, status: "rejected" }]).mockResolvedValueOnce([]);
    await expect(convertToInvoice(5)).rejects.toThrow("Abgelehnte");
    expect(createInvoice).not.toHaveBeenCalled();
  });
});
