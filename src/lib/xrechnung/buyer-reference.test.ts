import { describe, expect, it } from "vitest";
import { followCustomerLeitweg, normalizeBuyerReference, resolveBuyerReference } from "./buyer-reference";

describe("normalizeBuyerReference", () => {
  it.each([
    [undefined, null],
    [null, null],
    ["", null],
    ["   ", null],
    ["  04011000-1234512345-35 ", "04011000-1234512345-35"],
  ])("turns %j into %j", (input, expected) => {
    expect(normalizeBuyerReference(input)).toBe(expected);
  });
});

describe("resolveBuyerReference", () => {
  it("takes the customer's Leitweg-ID when nothing is passed", () => {
    expect(resolveBuyerReference(undefined, "04011000-1234512345-35")).toBe("04011000-1234512345-35");
  });

  it("is empty when nothing is passed and the customer has none", () => {
    expect(resolveBuyerReference(undefined, null)).toBeNull();
    expect(resolveBuyerReference(undefined, "  ")).toBeNull();
  });

  it("lets an explicit value override the customer's", () => {
    expect(resolveBuyerReference("991-0815-12", "04011000-1234512345-35")).toBe("991-0815-12");
  });

  it("respects an emptied field instead of falling back to the customer's", () => {
    expect(resolveBuyerReference(null, "04011000-1234512345-35")).toBeNull();
    expect(resolveBuyerReference("", "04011000-1234512345-35")).toBeNull();
  });
});

describe("followCustomerLeitweg", () => {
  const none = { customerId: null, leitwegId: "" };
  const amt = { customerId: 1, leitwegId: "04011000-1234512345-35" };
  const other = { customerId: 2, leitwegId: "991-0815-12" };

  it("fills an empty field when the first customer is selected", () => {
    expect(followCustomerLeitweg("", none, amt)).toEqual({ value: amt.leitwegId, followed: amt });
  });

  it("re-follows when the customer changes and the value is still the followed default", () => {
    expect(followCustomerLeitweg(amt.leitwegId, amt, other)).toEqual({ value: other.leitwegId, followed: other });
  });

  it("keeps a value the user entered when the customer changes", () => {
    expect(followCustomerLeitweg("mine", amt, other)).toEqual({ value: "mine", followed: other });
  });

  it("leaves the value alone while the customer stays the same", () => {
    expect(followCustomerLeitweg("mine", amt, amt)).toEqual({ value: "mine", followed: amt });
    expect(followCustomerLeitweg("", amt, amt)).toEqual({ value: "", followed: amt });
  });

  describe("opening a stored invoice", () => {
    it("keeps an empty stored reference although the customer has a Leitweg-ID now", () => {
      const stored = { customerId: 1, leitwegId: "" };
      expect(followCustomerLeitweg("", stored, amt)).toEqual({ value: "", followed: stored });
    });

    it("keeps the stored reference", () => {
      const stored = { customerId: 1, leitwegId: "OLD-1" };
      expect(followCustomerLeitweg("OLD-1", stored, amt).value).toBe("OLD-1");
    });

    it("follows a different customer chosen in the form", () => {
      const stored = { customerId: 1, leitwegId: "OLD-1" };
      expect(followCustomerLeitweg("OLD-1", stored, other).value).toBe(other.leitwegId);
    });
  });
});
