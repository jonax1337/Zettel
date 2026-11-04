import { describe, expect, it } from "vitest";
import { eurStringToCents } from "$lib/utils/money";
import { centsToPriceText, commitPriceText, pluralize } from "./format";

describe("centsToPriceText", () => {
  it("formats cents with a decimal comma and two digits", () => {
    expect(centsToPriceText(0)).toBe("0,00");
    expect(centsToPriceText(5)).toBe("0,05");
    expect(centsToPriceText(123456)).toBe("1234,56");
  });

  it("round-trips through eurStringToCents", () => {
    for (const cents of [0, 1, 99, 100, 123456, 100000000]) {
      expect(eurStringToCents(centsToPriceText(cents))).toBe(cents);
    }
  });
});

describe("commitPriceText", () => {
  it("stores the parsed cents and normalizes the text", () => {
    const row = { priceText: "1.234,5", unitPrice: 0 };
    commitPriceText(row);
    expect(row).toEqual({ priceText: "1234,50", unitPrice: 123450 });
  });

  it("falls back to zero for unparsable input", () => {
    const row = { priceText: "abc", unitPrice: 999 };
    commitPriceText(row);
    expect(row).toEqual({ priceText: "0,00", unitPrice: 0 });
  });
});

describe("pluralize", () => {
  it("uses the singular only for exactly one", () => {
    expect(pluralize(1, "Beleg", "Belege")).toBe("Beleg");
    expect(pluralize(0, "Beleg", "Belege")).toBe("Belege");
    expect(pluralize(2, "Beleg", "Belege")).toBe("Belege");
  });
});
