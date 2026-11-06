import { describe, expect, it } from "vitest";
import { canReopenOffer, offerKeepsStoredAmounts } from "./offer-actions";

describe("canReopenOffer", () => {
  it.each(["sent", "rejected", "expired"] as const)("allows %s offers", (status) => {
    expect(canReopenOffer({ status, convertedInvoiceId: null })).toBe(true);
  });

  it("allows an accepted offer that was not converted", () => {
    expect(canReopenOffer({ status: "accepted", convertedInvoiceId: null })).toBe(true);
  });

  it("rejects an accepted offer that was converted into an invoice", () => {
    expect(canReopenOffer({ status: "accepted", convertedInvoiceId: 7 })).toBe(false);
  });

  it("rejects drafts", () => {
    expect(canReopenOffer({ status: "draft", convertedInvoiceId: null })).toBe(false);
  });
});

describe("offerKeepsStoredAmounts", () => {
  it("is true for a draft with a stored PDF, e.g. a sent offer that was reopened", () => {
    expect(offerKeepsStoredAmounts({ pdfPath: "C:/Zettel/Angebote/AN-2026-0001.pdf" })).toBe(true);
  });

  it("is false for a draft that never had a PDF", () => {
    expect(offerKeepsStoredAmounts({ pdfPath: null })).toBe(false);
  });
});
