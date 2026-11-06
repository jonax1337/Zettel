import { describe, expect, it } from "vitest";
import { computeLineTotal, computeTotals } from "./totals";

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

  it("rounds VAT per line (not on the cumulative subtotal)", () => {
    // 3 × 333 = 999 cents net, 19 % → 189.81 → rounded to 190
    const t = computeTotals(
      [{ quantity: 3, unitPrice: 333, vatRate: 19 }],
      opts,
    );
    expect(t.subtotal).toBe(999);
    expect(t.vatAmount).toBe(190);
    expect(t.total).toBe(1189);
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
