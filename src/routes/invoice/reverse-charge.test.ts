import { describe, expect, it } from "vitest";
import { restoreVatRates, zeroVatRatesRemembering, type VatRateSnapshot } from "./reverse-charge";

describe("VAT rates across a reverse-charge toggle", () => {
  it("restores the original rates after reverse charge is switched off", () => {
    const items = [
      { uid: 1, vatRate: 19 },
      { uid: 2, vatRate: 7 },
      { uid: 3, vatRate: 0 },
    ];
    const snapshot: VatRateSnapshot = new Map();

    zeroVatRatesRemembering(items, snapshot);
    expect(items.map((i) => i.vatRate)).toEqual([0, 0, 0]);

    restoreVatRates(items, snapshot);
    expect(items.map((i) => i.vatRate)).toEqual([19, 7, 0]);
    expect(snapshot.size).toBe(0);
  });

  it("keeps the first remembered rate when zeroing runs repeatedly", () => {
    const items = [{ uid: 1, vatRate: 19 }];
    const snapshot: VatRateSnapshot = new Map();

    zeroVatRatesRemembering(items, snapshot);
    zeroVatRatesRemembering(items, snapshot);
    restoreVatRates(items, snapshot);

    expect(items[0].vatRate).toBe(19);
  });

  it("does not touch rows added while reverse charge was active", () => {
    const items = [{ uid: 1, vatRate: 19 }];
    const snapshot: VatRateSnapshot = new Map();
    zeroVatRatesRemembering(items, snapshot);
    items.push({ uid: 2, vatRate: 0 });

    restoreVatRates(items, snapshot);

    expect(items.map((i) => i.vatRate)).toEqual([19, 0]);
  });

  it("leaves a rate the user raised again while reverse charge was active", () => {
    const items = [{ uid: 1, vatRate: 19 }];
    const snapshot: VatRateSnapshot = new Map();
    zeroVatRatesRemembering(items, snapshot);
    items[0].vatRate = 7;

    restoreVatRates(items, snapshot);

    expect(items[0].vatRate).toBe(7);
  });
});
