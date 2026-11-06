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
  it("replaces a value that still equals the previously followed Leitweg-ID", () => {
    expect(followCustomerLeitweg("A", "A", "B")).toBe("B");
  });

  it("fills an empty field when the first customer is selected", () => {
    expect(followCustomerLeitweg("", "", "B")).toBe("B");
  });

  it("keeps a value the user entered", () => {
    expect(followCustomerLeitweg("mine", "A", "B")).toBe("mine");
  });
});
