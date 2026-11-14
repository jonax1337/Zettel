import { describe, expect, it } from "vitest";
import { computeLineTotal, computeTotals, roundQuantity } from "./totals";

describe("roundQuantity", () => {
  it("keeps four decimals, the precision of the XML and of the exact line total", () => {
    expect(roundQuantity(0.12345)).toBe(0.1235);
    expect(roundQuantity(1.00004)).toBe(1);
    expect(roundQuantity(0.00025)).toBe(0.0003);
    expect(roundQuantity(2.5)).toBe(2.5);
    expect(roundQuantity(-1.5)).toBe(-1.5);
  });
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s instead of storing a quantity of 0",
    (missing) => {
      expect(() => roundQuantity(missing as unknown as number)).toThrow("Menge fehlt oder ist ungültig.");
    },
  );
});

describe("computeLineTotal", () => {
  it("multiplies quantity × unitPrice (cent integer)", () => {
    expect(computeLineTotal({ quantity: 1, unitPrice: 10000, vatRate: 19 })).toBe(10000);
    expect(computeLineTotal({ quantity: 3, unitPrice: 999, vatRate: 19 })).toBe(2997);
  });
  it("rounds fractional quantities half-up", () => {
    // 0.5h × 5000 cents = 2500 — exact
    expect(computeLineTotal({ quantity: 0.5, unitPrice: 5000, vatRate: 19 })).toBe(2500);
    // 1.5h × 999 cents = 1498.5 → 1499 (Math.round half-up for positives)
    expect(computeLineTotal({ quantity: 1.5, unitPrice: 999, vatRate: 19 })).toBe(1499);
  });
  it("rounds exact half cents up where the float product falls just below", () => {
    // 0.47 * 8550 is 4018.4999999999995 in floating point; the exact product is 4018.5.
    expect(computeLineTotal({ quantity: 0.47, unitPrice: 8550, vatRate: 19 })).toBe(4019);
    // 4.1 * 15 is 61.49999999999999; the exact product is 61.5.
    expect(computeLineTotal({ quantity: 4.1, unitPrice: 15, vatRate: 19 })).toBe(62);
  });
  it("rounds negative half cents towards positive infinity like Math.round", () => {
    expect(computeLineTotal({ quantity: 1.5, unitPrice: -333, vatRate: 19 })).toBe(-499);
    expect(computeLineTotal({ quantity: -0.47, unitPrice: 8550, vatRate: 19 })).toBe(-4018);
  });
  it("keeps four quantity decimals exact", () => {
    expect(computeLineTotal({ quantity: 1.2345, unitPrice: 10000, vatRate: 19 })).toBe(12345);
    expect(computeLineTotal({ quantity: 0.0001, unitPrice: 5000, vatRate: 19 })).toBe(1);
  });
  it("stays exact beyond the 2^53 range of a float product", () => {
    // Float: 12345.6789 * 98765432101 rounds to ...699; the exact result is ...698.
    expect(computeLineTotal({ quantity: 12345.6789, unitPrice: 98765432101, vatRate: 19 })).toBe(1219326311138698);
  });
  it("does not throw on half-typed editor input", () => {
    expect(computeLineTotal({ quantity: Number.NaN, unitPrice: 500, vatRate: 19 })).toBeNaN();
    expect(computeLineTotal({ quantity: 2, unitPrice: 0.5, vatRate: 19 })).toBe(1);
  });
  it("returns a fixed line total as it is instead of recomputing the product", () => {
    // Issued with the former float rounding: 0,47 x 85,50 EUR was stored as 40,18 EUR.
    expect(computeLineTotal({ quantity: 0.47, unitPrice: 8550, vatRate: 19, fixedLineTotal: 4018 })).toBe(4018);
    expect(computeLineTotal({ quantity: 1, unitPrice: 100, vatRate: 19, fixedLineTotal: 0 })).toBe(0);
  });
  it("computes a row that merely carries a lineTotal (stored or extracted rows)", () => {
    const row = { quantity: 0.47, unitPrice: 8550, vatRate: 19, lineTotal: 4018 };
    expect(computeLineTotal(row)).toBe(4019);
  });
  it("handles zero", () => {
    expect(computeLineTotal({ quantity: 0, unitPrice: 12345, vatRate: 19 })).toBe(0);
    expect(computeLineTotal({ quantity: 5, unitPrice: 0, vatRate: 19 })).toBe(0);
  });
  it("supports negative quantities (storno)", () => {
    expect(computeLineTotal({ quantity: -1, unitPrice: 10000, vatRate: 19 })).toBe(-10000);
  });
});

describe("computeTotals — regular (no exemption)", () => {
  const opts = { isKleinunternehmer: false, isReverseCharge: false };

  it("computes a single 19 % line", () => {
    const t = computeTotals(
      [{ quantity: 1, unitPrice: 10000, vatRate: 19 }],
      opts,
    );
    expect(t).toEqual({ subtotal: 10000, vatAmount: 1900, total: 11900 });
  });

  it("sums multiple positions with mixed VAT rates", () => {
    const t = computeTotals(
      [
        { quantity: 2, unitPrice: 5000, vatRate: 19 }, // 100,00 € net, 19,00 € VAT
        { quantity: 1, unitPrice: 1000, vatRate: 7 },  //  10,00 € net,  0,70 € VAT
      ],
      opts,
    );
    expect(t.subtotal).toBe(11000);
    expect(t.vatAmount).toBe(1970);
    expect(t.total).toBe(12970);
  });

  it("rounds a single line's VAT to the nearest cent", () => {
    // 3 × 333 = 999 cents net, 19 % → 189.81 → rounded to 190
    const t = computeTotals(
      [{ quantity: 3, unitPrice: 333, vatRate: 19 }],
      opts,
    );
    expect(t.subtotal).toBe(999);
    expect(t.vatAmount).toBe(190);
    expect(t.total).toBe(1189);
  });

  it("rounds VAT per line (not on the cumulative subtotal)", () => {
    // each line: 333 × 19 % = 63.27 → 63; cumulative: 666 × 19 % = 126.54 → 127
    const t = computeTotals(
      [
        { quantity: 1, unitPrice: 333, vatRate: 19 },
        { quantity: 1, unitPrice: 333, vatRate: 19 },
      ],
      opts,
    );
    expect(t.subtotal).toBe(666);
    expect(t.vatAmount).toBe(126);
    expect(t.total).toBe(792);
  });

  it("handles 0 % VAT positions (passes through subtotal)", () => {
    const t = computeTotals(
      [{ quantity: 1, unitPrice: 5000, vatRate: 0 }],
      opts,
    );
    expect(t).toEqual({ subtotal: 5000, vatAmount: 0, total: 5000 });
  });

  it("empty items list yields zeros", () => {
    expect(computeTotals([], opts)).toEqual({ subtotal: 0, vatAmount: 0, total: 0 });
  });
});

describe("computeTotals — Kleinunternehmer", () => {
  const opts = { isKleinunternehmer: true, isReverseCharge: false };

  it("never adds VAT, regardless of per-line rate", () => {
    const t = computeTotals(
      [
        { quantity: 1, unitPrice: 10000, vatRate: 19 },
        { quantity: 1, unitPrice: 5000, vatRate: 7 },
      ],
      opts,
    );
    expect(t.subtotal).toBe(15000);
    expect(t.vatAmount).toBe(0);
    expect(t.total).toBe(15000);
  });
});

describe("computeTotals — Reverse-Charge", () => {
  const opts = { isKleinunternehmer: false, isReverseCharge: true };

  it("zeros VAT even if positions still carry a rate", () => {
    // Reverse-charge invoices may still hold a vatRate in the input (UI keeps
    // it for switching back), but the math must report 0.
    const t = computeTotals(
      [{ quantity: 1, unitPrice: 12345, vatRate: 19 }],
      opts,
    );
    expect(t).toEqual({ subtotal: 12345, vatAmount: 0, total: 12345 });
  });
});

describe("computeTotals — Storno (Credit-Note)", () => {
  const opts = { isKleinunternehmer: false, isReverseCharge: false };

  it("propagates negative signs through subtotal, VAT and total", () => {
    const t = computeTotals(
      [{ quantity: -1, unitPrice: 10000, vatRate: 19 }],
      opts,
    );
    expect(t.subtotal).toBe(-10000);
    expect(t.vatAmount).toBe(-1900);
    expect(t.total).toBe(-11900);
  });
});
