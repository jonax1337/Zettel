import { describe, expect, it } from "vitest";
import { vatExemptNote } from "./vat-note";

describe("vatExemptNote", () => {
  it("names the Kleinunternehmer rule first", () => {
    expect(vatExemptNote(true, "intra_eu")).toMatch(/§ 19 UStG/);
  });

  it("names reverse charge for both cross-border types", () => {
    expect(vatExemptNote(false, "intra_eu")).toMatch(/Reverse-Charge/);
    expect(vatExemptNote(false, "third_country")).toMatch(/Reverse-Charge/);
  });

  it("is null when VAT is shown", () => {
    expect(vatExemptNote(false, "none")).toBeNull();
  });
});
