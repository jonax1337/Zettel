import { describe, expect, it } from "vitest";
import { formatDate } from "$lib/utils/date";
import { invoiceFacts, invoiceSheetDates, offerFacts, offerSheetDates } from "./document-facts";

const SENT = new Date(2026, 9, 21, 12).getTime() / 1000;
const PAID = new Date(2026, 10, 12, 12).getTime() / 1000;

function invoice(overrides: Partial<Parameters<typeof invoiceFacts>[0]> = {}): Parameters<typeof invoiceFacts>[0] {
  return {
    number: "RE-2026-0013",
    status: "sent",
    sentAt: null,
    paidAt: null,
    reverseChargeType: "none",
    supplyKind: "services",
    buyerReference: null,
    currency: "EUR",
    exchangeRate: null,
    eurTotalCent: null,
    ...overrides,
  };
}

describe("invoiceFacts", () => {
  it("has nothing to add for a plain open invoice", () => {
    expect(invoiceFacts(invoice())).toEqual([]);
  });

  it("names the draft by its short id", () => {
    expect(invoiceFacts(invoice({ status: "draft", number: "DRAFT-d349aaaabbbbcccc" }))).toEqual([
      { label: "Kennung", value: "Entwurf #d349", mono: true },
    ]);
  });

  it("lists the sent and paid dates", () => {
    expect(invoiceFacts(invoice({ sentAt: SENT, paidAt: PAID }))).toEqual([
      { label: "Versendet", value: formatDate(SENT) },
      { label: "Bezahlt", value: formatDate(PAID) },
    ]);
  });

  it("names the kind of supply on a cross-border invoice", () => {
    expect(invoiceFacts(invoice({ reverseChargeType: "intra_eu", supplyKind: "goods" }))).toEqual([
      { label: "Art des Umsatzes", value: "Lieferung" },
    ]);
  });

  it("lists the buyer reference", () => {
    expect(invoiceFacts(invoice({ buyerReference: "04011000-12345-34" }))).toEqual([
      { label: "Käuferreferenz", value: "04011000-12345-34", mono: true },
    ]);
  });

  it("books a foreign-currency invoice with rate and frozen EUR total", () => {
    const facts = invoiceFacts(invoice({ currency: "USD", exchangeRate: "1.0850", eurTotalCent: 92_166 }));
    expect(facts.map((fact) => fact.label)).toEqual(["Währung", "Wechselkurs", "Gesamt (EUR)"]);
    expect(facts[1].value).toBe("1 EUR = 1.0850 USD");
    expect(facts[2].value).toContain("921,66");
  });

  it("leaves out rate and EUR total that were not stored", () => {
    expect(invoiceFacts(invoice({ currency: "USD" })).map((fact) => fact.label)).toEqual(["Währung"]);
  });

  it("does not list a frozen EUR total for an EUR invoice", () => {
    expect(invoiceFacts(invoice({ eurTotalCent: 50_000 }))).toEqual([]);
  });
});

describe("offerFacts", () => {
  const base = { sentAt: null, acceptedAt: null, rejectedAt: null, isReverseCharge: false, supplyKind: "services" } as const;

  it("has nothing to add for a fresh offer", () => {
    expect(offerFacts(base)).toEqual([]);
  });

  it("lists the dates of the offer's life in order", () => {
    expect(offerFacts({ ...base, sentAt: SENT, acceptedAt: PAID }).map((fact) => fact.label)).toEqual([
      "Versendet",
      "Angenommen",
    ]);
    expect(offerFacts({ ...base, sentAt: SENT, rejectedAt: PAID }).map((fact) => fact.label)).toEqual([
      "Versendet",
      "Abgelehnt",
    ]);
  });

  it("names the kind of supply of a reverse-charge offer", () => {
    expect(offerFacts({ ...base, isReverseCharge: true })).toEqual([
      { label: "Art des Umsatzes", value: "Sonstige Leistung" },
    ]);
  });
});

describe("invoiceSheetDates", () => {
  const ISSUED = new Date(2026, 9, 20, 12).getTime() / 1000;
  const DUE = new Date(2026, 10, 3, 12).getTime() / 1000;
  const base = { isCreditNote: false, issueDate: ISSUED, dueDate: DUE, servicePeriodStart: null, servicePeriodEnd: null, deliveryDate: null };

  it("lists invoice date and due date", () => {
    expect(invoiceSheetDates(base)).toEqual([
      { label: "Rechnungsdatum", value: formatDate(ISSUED) },
      { label: "Fällig am", value: formatDate(DUE) },
    ]);
  });

  it("prefers the service period over the delivery date, as the sheet does", () => {
    const both = invoiceSheetDates({ ...base, servicePeriodStart: ISSUED, servicePeriodEnd: DUE, deliveryDate: ISSUED });
    expect(both.map((fact) => fact.label)).toEqual(["Rechnungsdatum", "Fällig am", "Leistungszeitraum"]);
    expect(invoiceSheetDates({ ...base, deliveryDate: ISSUED }).at(-1)).toEqual({ label: "Leistungsdatum", value: formatDate(ISSUED) });
  });

  it("names the date of a credit note and gives it no due date", () => {
    expect(invoiceSheetDates({ ...base, isCreditNote: true })).toEqual([{ label: "Stornodatum", value: formatDate(ISSUED) }]);
  });
});

describe("offerSheetDates", () => {
  const ISSUED = new Date(2026, 9, 20, 12).getTime() / 1000;
  const VALID = new Date(2026, 10, 20, 12).getTime() / 1000;

  it("lists offer date and validity, plus the service period when there is one", () => {
    const base = { issueDate: ISSUED, validUntil: VALID, servicePeriodStart: null, servicePeriodEnd: null };
    expect(offerSheetDates(base).map((fact) => fact.label)).toEqual(["Angebotsdatum", "Gültig bis"]);
    expect(offerSheetDates({ ...base, servicePeriodStart: ISSUED, servicePeriodEnd: VALID }).at(-1)?.label).toBe("Leistungszeitraum");
  });
});
