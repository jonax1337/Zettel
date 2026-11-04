import { describe, expect, it } from "vitest";
import { canReopenOffer } from "./offer-actions";

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
