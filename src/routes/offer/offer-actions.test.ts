import { describe, expect, it } from "vitest";
import { actionsAt } from "../invoice/detail/action-plan";
import {
  awaitsConversion,
  canReopenOffer,
  offerKeepsStoredAmounts,
  planOfferActions,
  type OfferActionState,
} from "./offer-actions";

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

describe("awaitsConversion", () => {
  it("is true for an accepted offer without an invoice", () => {
    expect(awaitsConversion({ status: "accepted", convertedInvoiceId: null })).toBe(true);
  });

  it("is false once the invoice exists", () => {
    expect(awaitsConversion({ status: "accepted", convertedInvoiceId: 7 })).toBe(false);
  });

  it.each(["draft", "sent", "rejected", "expired"] as const)("is false for a %s offer", (status) => {
    expect(awaitsConversion({ status, convertedInvoiceId: null })).toBe(false);
  });
});

describe("planOfferActions", () => {
  function plan(overrides: Partial<OfferActionState> = {}) {
    return planOfferActions({ status: "sent", convertedInvoiceId: null, hasPdf: true, ...overrides });
  }

  it.each([
    ["draft", { status: "draft" }, "mark-sent"],
    ["sent", { status: "sent" }, "accept"],
    ["accepted", { status: "accepted" }, "convert"],
  ] satisfies [string, Partial<OfferActionState>, string][])("makes the step forward of a %s offer the main action", (_name, overrides, main) => {
    expect(actionsAt(plan(overrides), "main")).toEqual([main]);
  });

  it.each([
    ["an accepted offer that became an invoice", { status: "accepted", convertedInvoiceId: 7 }],
    ["a rejected offer", { status: "rejected" }],
    ["an expired offer", { status: "expired" }],
  ] satisfies [string, Partial<OfferActionState>][])("has no main action for %s", (_name, overrides) => {
    expect(actionsAt(plan(overrides), "main")).toEqual([]);
  });

  it("lets a draft be edited and sent next to the PDF", () => {
    expect(actionsAt(plan({ status: "draft" }), "header")).toEqual(["open-pdf", "edit", "send-mail"]);
  });

  it("offers the rejection next to the acceptance of a sent offer", () => {
    expect(actionsAt(plan({ status: "sent" }), "header")).toEqual(["open-pdf", "send-mail", "reject"]);
  });

  it("keeps PDF creation reachable while there is no PDF", () => {
    const withoutPdf = plan({ hasPdf: false });
    expect(actionsAt(withoutPdf, "header")[0]).toBe("generate-pdf");
    expect(actionsAt(withoutPdf, "menu")).not.toContain("regenerate-pdf");
  });

  it("previews a draft from the menu, even without a PDF, and no other offer", () => {
    expect(actionsAt(plan({ status: "draft", hasPdf: false }), "menu")[0]).toBe("preview-pdf");
    for (const status of ["sent", "accepted", "rejected", "expired"] as const) {
      expect(actionsAt(plan({ status }), "menu")).not.toContain("preview-pdf");
      expect(actionsAt(plan({ status }), "header")).not.toContain("preview-pdf");
    }
  });

  it("moves PDF regeneration into the menu once there is a PDF", () => {
    expect(actionsAt(plan(), "menu")).toContain("regenerate-pdf");
  });

  it("offers reopening and deleting where they are allowed today", () => {
    expect(actionsAt(plan({ status: "draft" }), "menu")).toEqual(["preview-pdf", "regenerate-pdf", "delete"]);
    expect(actionsAt(plan({ status: "rejected" }), "menu")).toEqual(["regenerate-pdf", "reopen-draft", "delete"]);
    expect(actionsAt(plan({ status: "sent" }), "menu")).toEqual(["regenerate-pdf", "reopen-draft"]);
    expect(actionsAt(plan({ status: "accepted", convertedInvoiceId: 7 }), "menu")).toEqual(["regenerate-pdf"]);
  });
});
