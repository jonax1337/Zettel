import { describe, it, expect } from "vitest";
import { centsToEur, eurStringToCents } from "./money";

describe("centsToEur", () => {
  it("formats whole euros", () => {
    expect(centsToEur(1000000)).toBe("10.000,00\u00a0€");
  });

  it("formats sub-euro values", () => {
    expect(centsToEur(199)).toBe("1,99\u00a0€");
  });

  it("formats zero", () => {
    expect(centsToEur(0)).toBe("0,00\u00a0€");
  });

  it("formats negative values", () => {
    expect(centsToEur(-12345)).toBe("-123,45\u00a0€");
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

  it.each([
    ["119.00", 11900],
    ["12.50", 1250],
    ["12.5", 1250],
    ["0.5", 50],
    ["0.99", 99],
    ["1234.56", 123456],
    ["119,00", 11900],
    ["119,5", 11950],
    [",50", 50],
    ["5,", 500],
    ["1.234", 123400],
    ["12.345", 1234500],
    ["1.234.567", 123456700],
    ["1.234,5", 123450],
    ["0.500", 50],
    ["-12,50", -1250],
    ["-12.50", -1250],
    ["  12,50 € ", 1250],
    ["1,005", 101],
    ["1,004", 100],
    ["0,00", 0],
    ["-0", 0],
  ])("parses %j as %i cents", (input, expected) => {
    expect(eurStringToCents(input)).toBe(expected);
  });

  it.each(["1.2.3", "1,2,3", "12.34,56", "1.23,45", "1,2.3", "12abc", ".", "-", "--5", "5-"])(
    "returns 0 for malformed input %j",
    (input) => {
      expect(eurStringToCents(input)).toBe(0);
    },
  );

  it("roundtrips through centsToEur", () => {
    const original = 199950;
    const formatted = centsToEur(original);
    expect(eurStringToCents(formatted)).toBe(original);
  });
});
