import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: vi.fn(), join: vi.fn() }));
vi.mock("$lib/db/client", () => ({ execute: vi.fn() }));
vi.mock("$lib/db/offers", () => ({ getOffer: vi.fn() }));
vi.mock("$lib/db/invoices", () => ({ getInvoice: vi.fn() }));
vi.mock("$lib/db/reminders", () => ({
  getReminder: vi.fn(),
  levelLabel: (level: string) => (level === "reminder" ? "Zahlungserinnerung" : "Mahnung"),
}));
vi.mock("$lib/db/queries", () => ({ loadSettings: vi.fn() }));

import type { Invoice, Offer, Reminder, Settings } from "$lib/db/schema";
import { buildOfferPayload } from "./offer";
import { buildReminderPayload } from "./reminder";

const COMPANY = { companyName: "Firma", pdfTheme: "classic" } as Settings;
const CUSTOMER = { name: "Kunde" } as never;

describe("buildOfferPayload", () => {
  const offer = {
    number: "AN-1",
    issueDate: 100,
    validUntil: 200,
    subtotal: 10000,
    vatAmount: 1900,
    total: 11900,
    currency: "USD",
    exchangeRate: "1.08",
    skontoPercent: null,
    skontoDays: null,
  } as unknown as Offer;

  it("sends the offer currency and exchange rate", () => {
    const payload = buildOfferPayload({ offer, items: [], customer: CUSTOMER, company: COMPANY, outputPath: "o.pdf" });

    expect(payload.offer).toMatchObject({ currency: "USD", exchangeRate: "1.08" });
  });

  it("falls back to EUR when the row has no currency", () => {
    const payload = buildOfferPayload({
      offer: { ...offer, currency: undefined } as unknown as Offer,
      items: [],
      customer: CUSTOMER,
      company: COMPANY,
      outputPath: "o.pdf",
    });

    expect(payload.offer.currency).toBe("EUR");
  });
});

describe("buildReminderPayload", () => {
  const reminder = { number: "MA-1", level: "reminder", feeCents: 500 } as unknown as Reminder;
  const snapshot = {
    invoiceNumber: "RE-1",
    invoiceIssueDate: 1,
    invoiceDueDate: 2,
    customerName: "Kunde",
    customerStreet: "",
    customerPostalCode: "",
    customerCity: "",
    customerCountry: "DE",
    customerContactPerson: null,
  };

  it("passes the invoice currency so amounts are not printed as euros", () => {
    const payload = buildReminderPayload({
      reminder,
      invoice: { currency: "GBP" } as Invoice,
      snapshot,
      company: COMPANY,
      outputPath: "m.pdf",
    });

    expect(payload.invoice).toMatchObject({ invoiceNumber: "RE-1", currency: "GBP" });
  });

  it("passes fee, interest and total as stored, all in the invoice currency", () => {
    const payload = buildReminderPayload({
      reminder: {
        ...reminder,
        interestCents: 250,
        originalTotalCents: 100000,
        totalDueCents: 100750,
      } as Reminder,
      invoice: { currency: "USD" } as Invoice,
      snapshot,
      company: COMPANY,
      outputPath: "m.pdf",
    });

    expect(payload.reminder).toMatchObject({
      feeCents: 500,
      interestCents: 250,
      originalTotalCents: 100000,
      totalDueCents: 100750,
    });
    expect(payload.invoice.currency).toBe("USD");
  });
});
