import { describe, expect, it } from "vitest";
import {
  isSelectedReverseChargeBlocked,
  restoreVatRates,
  reverseChargeAvailability,
  reverseChargeBlockedReason,
  zeroVatRatesRemembering,
  type VatRateSnapshot,
} from "./reverse-charge";

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

describe("reverse-charge availability", () => {
  const eligible = { senderIsKleinunternehmer: false, senderVatId: "DE123456789" };

  it("offers both options when sender and customer have a VAT ID", () => {
    const input = { ...eligible, customer: { vatId: "FR123" } };
    expect(reverseChargeAvailability(input)).toEqual({ third_country: true, intra_eu: true });
    expect(reverseChargeBlockedReason(input)).toBe("");
  });

  it("blocks intra-EU without a customer and says why", () => {
    const input = { ...eligible, customer: null };
    expect(reverseChargeAvailability(input)).toEqual({ third_country: true, intra_eu: false });
    expect(reverseChargeBlockedReason(input)).toContain("Kunden auswählen");
  });

  it("blocks intra-EU for a customer without VAT ID and says why", () => {
    const input = { ...eligible, customer: { vatId: null } };
    expect(reverseChargeAvailability(input).intra_eu).toBe(false);
    expect(reverseChargeBlockedReason(input)).toContain("USt-IdNr.");
  });

  it("blocks everything for Kleinunternehmer or a sender without VAT ID", () => {
    const kleinunternehmer = { senderIsKleinunternehmer: true, senderVatId: "DE1", customer: { vatId: "FR1" } };
    expect(reverseChargeAvailability(kleinunternehmer)).toEqual({ third_country: false, intra_eu: false });
    expect(reverseChargeBlockedReason(kleinunternehmer)).toContain("Kleinunternehmer");

    const noVatId = { senderIsKleinunternehmer: false, senderVatId: "", customer: { vatId: "FR1" } };
    expect(reverseChargeAvailability(noVatId)).toEqual({ third_country: false, intra_eu: false });
    expect(reverseChargeBlockedReason(noVatId)).toContain("Eigene USt-IdNr.");
  });
});

describe("isSelectedReverseChargeBlocked", () => {
  const onlyThirdCountry = { third_country: true, intra_eu: false };

  it("flags a selected option that became unavailable", () => {
    expect(isSelectedReverseChargeBlocked("intra_eu", onlyThirdCountry)).toBe(true);
  });

  it("does not flag available options or no selection", () => {
    expect(isSelectedReverseChargeBlocked("third_country", onlyThirdCountry)).toBe(false);
    expect(isSelectedReverseChargeBlocked("none", { third_country: false, intra_eu: false })).toBe(false);
  });
});
