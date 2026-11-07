import { describe, expect, it } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  computeEurTotalCent,
  eurCentsToCurrency,
  formatMoney,
  fromEurCents,
  isValidCurrencyCode,
  parseExchangeRateScaled,
  toEurCents,
} from "./currency";

describe("isValidCurrencyCode", () => {
  it("accepts exactly the supported codes", () => {
    expect(SUPPORTED_CURRENCIES.map((c) => c.code)).toEqual([
      "EUR", "USD", "GBP", "CHF", "AUD", "CAD", "JPY", "NOK", "SEK", "DKK", "PLN", "CZK",
    ]);
    for (const code of ["EUR", "USD", "JPY", "CZK"]) {
      expect(isValidCurrencyCode(code)).toBe(true);
    }
  });
  it("rejects unknown codes", () => {
    expect(isValidCurrencyCode("ZZZ")).toBe(false);
    expect(isValidCurrencyCode("eur")).toBe(false); // case-sensitive
    expect(isValidCurrencyCode("")).toBe(false);
  });
});

describe("parseExchangeRateScaled", () => {
  it("parses dot decimal", () => {
    expect(parseExchangeRateScaled("1.0832")).toBe(108320000n);
  });
  it("parses comma decimal", () => {
    expect(parseExchangeRateScaled("1,0832")).toBe(108320000n);
  });
  it("parses integer rate", () => {
    expect(parseExchangeRateScaled("110")).toBe(11000000000n);
  });
  it("pads to 8 fractional digits", () => {
    expect(parseExchangeRateScaled("1.5")).toBe(150000000n);
  });
  it("truncates excess fractional digits", () => {
    expect(parseExchangeRateScaled("1.123456789012")).toBe(112345678n);
  });
  it("rejects negative", () => {
    expect(parseExchangeRateScaled("-1.5")).toBeNull();
  });
  it("rejects zero", () => {
    expect(parseExchangeRateScaled("0")).toBeNull();
    expect(parseExchangeRateScaled("0.0")).toBeNull();
  });
  it("rejects garbage", () => {
    expect(parseExchangeRateScaled("abc")).toBeNull();
    expect(parseExchangeRateScaled("1.2.3")).toBeNull();
    expect(parseExchangeRateScaled("")).toBeNull();
  });
  it("trims whitespace", () => {
    expect(parseExchangeRateScaled("  1.5  ")).toBe(150000000n);
  });
});

describe("toEurCents", () => {
  it("converts USD at 1.08 to EUR", () => {
    // 108 USD cents @ rate 1.08 = 100 EUR cents
    const rate = parseExchangeRateScaled("1.08")!;
    expect(toEurCents(108, rate)).toBe(100);
  });
  it("rounds half-up", () => {
    // 1 cent at rate 2.00 = 0.5 cents → 1 (half-up)
    const rate = parseExchangeRateScaled("2.00")!;
    expect(toEurCents(1, rate)).toBe(1);
  });
  it("preserves sign on negative totals (storno)", () => {
    const rate = parseExchangeRateScaled("1.08")!;
    expect(toEurCents(-108, rate)).toBe(-100);
  });
  it("handles large totals without precision loss", () => {
    // naive Math.round(total / 1.0832) gives ...805 here; exact BigInt division gives ...804
    const rate = parseExchangeRateScaled("1.0832")!;
    expect(toEurCents(1_000_000_000_000_001, rate)).toBe(923190546528804);
  });
  it("rate < 1 yields a larger EUR amount", () => {
    // 100 GBP cents at rate 0.85 (1 EUR buys 0.85 GBP) ≈ 117.65 EUR cents → 118
    const rate = parseExchangeRateScaled("0.85")!;
    expect(toEurCents(100, rate)).toBe(118);
  });
});

describe("fromEurCents", () => {
  it("converts EUR to USD at 1.08", () => {
    expect(fromEurCents(500, parseExchangeRateScaled("1.08")!)).toBe(540);
  });
  it("rounds half-up", () => {
    // 5 EUR cents at rate 1.1 = 5.5 cents → 6
    expect(fromEurCents(5, parseExchangeRateScaled("1.1")!)).toBe(6);
    // 1 EUR cent at rate 1.4 = 1.4 cents → 1
    expect(fromEurCents(1, parseExchangeRateScaled("1.4")!)).toBe(1);
  });
  it("preserves sign", () => {
    expect(fromEurCents(-500, parseExchangeRateScaled("1.08")!)).toBe(-540);
  });
  it("rate < 1 shrinks the amount", () => {
    // 1 EUR buys 0.85 GBP: 5,00 EUR = 4,25 GBP
    expect(fromEurCents(500, parseExchangeRateScaled("0.85")!)).toBe(425);
  });
});

describe("eurCentsToCurrency", () => {
  it("returns the amount unchanged for EUR", () => {
    expect(eurCentsToCurrency(500, "EUR", null)).toBe(500);
  });
  it("converts with the invoice's exchange rate", () => {
    expect(eurCentsToCurrency(500, "USD", "1.0832")).toBe(542);
  });
  it("returns null for a foreign currency without a usable rate", () => {
    expect(eurCentsToCurrency(500, "USD", null)).toBeNull();
    expect(eurCentsToCurrency(500, "USD", "abc")).toBeNull();
  });
});

describe("computeEurTotalCent", () => {
  it("returns total unchanged for EUR", () => {
    expect(computeEurTotalCent("EUR", 12345, "1.0")).toBe(12345);
    expect(computeEurTotalCent("EUR", 12345, null)).toBe(12345);
    expect(computeEurTotalCent("EUR", 12345, "")).toBe(12345);
  });
  it("returns null when foreign + no rate", () => {
    expect(computeEurTotalCent("USD", 12345, null)).toBeNull();
    expect(computeEurTotalCent("USD", 12345, "")).toBeNull();
  });
  it("returns null when rate unparseable", () => {
    expect(computeEurTotalCent("USD", 12345, "abc")).toBeNull();
    expect(computeEurTotalCent("USD", 12345, "0")).toBeNull();
  });
  it("converts foreign currency with valid rate", () => {
    expect(computeEurTotalCent("USD", 108, "1.08")).toBe(100);
  });
});

describe("formatMoney", () => {
  it("formats EUR with 2 decimals", () => {
    expect(formatMoney(12345, "EUR")).toBe("123,45\u00a0€");
  });
  it("formats JPY with 0 decimals (zero-decimal currency)", () => {
    expect(formatMoney(12345, "JPY")).toBe("123\u00a0¥");
  });
  it("formats a well-formed but unlisted code via Intl", () => {
    expect(formatMoney(12345, "XYZ")).toBe("123,45\u00a0XYZ");
  });
  it("falls back to plain formatting when Intl rejects the code", () => {
    expect(formatMoney(12345, "EURO")).toBe("123.45 EURO");
  });
  it("defaults to EUR when currency is empty", () => {
    expect(formatMoney(100, "")).toBe("1,00\u00a0€");
  });
});
