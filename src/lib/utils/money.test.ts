import { describe, it, expect } from "vitest";
import { centsToEur, eurStringToCents } from "./money";

describe("centsToEur", () => {
  it("formats whole euros", () => {
    expect(centsToEur(1000000)).toMatch(/10\.000,00\s*€/);
  });

  it("formats sub-euro values", () => {
    expect(centsToEur(199)).toMatch(/1,99\s*€/);
  });

  it("formats zero", () => {
    expect(centsToEur(0)).toMatch(/0,00\s*€/);
  });

  it("formats negative values", () => {
    expect(centsToEur(-12345)).toMatch(/-123,45\s*€/);
  });
});

describe("eurStringToCents", () => {
  it("parses German decimal notation", () => {
    expect(eurStringToCents("1.234,56")).toBe(123456);
  });

  it("parses plain integer", () => {
    expect(eurStringToCents("42")).toBe(4200);
  });

  it("strips currency symbol and whitespace", () => {
    expect(eurStringToCents("€ 1.000,00")).toBe(100000);
  });

  it("returns 0 for invalid input", () => {
    expect(eurStringToCents("abc")).toBe(0);
    expect(eurStringToCents("")).toBe(0);
  });

  it("handles thousands separators", () => {
    expect(eurStringToCents("1.234.567,89")).toBe(123456789);
  });

  it("roundtrips through centsToEur", () => {
    const original = 199950;
    const formatted = centsToEur(original);
    expect(eurStringToCents(formatted)).toBe(original);
  });
});
