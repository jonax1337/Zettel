import { describe, expect, it } from "vitest";
import { reverseChargeBlockedReason } from "./reverse-charge";

const seller = { isKleinunternehmer: false, vatId: "DE123456789" };
const euBuyer = { vatId: "ATU12345678" };
const buyerWithoutVatId = { vatId: null };

describe("reverseChargeBlockedReason", () => {
  it("never blocks the regular treatment", () => {
    expect(reverseChargeBlockedReason("none", { ...seller, isKleinunternehmer: true }, null)).toBe("");
  });

  it.each(["intra_eu", "third_country"] as const)("blocks %s for Kleinunternehmer", (type) => {
    expect(reverseChargeBlockedReason(type, { ...seller, isKleinunternehmer: true }, euBuyer)).toContain(
      "Kleinunternehmer",
    );
  });

  it.each(["intra_eu", "third_country"] as const)("blocks %s without the seller's VAT ID", (type) => {
    expect(reverseChargeBlockedReason(type, { ...seller, vatId: null }, euBuyer)).toContain("Eigene USt-IdNr.");
  });

  it("needs the buyer's VAT ID for intra-EU only", () => {
    expect(reverseChargeBlockedReason("intra_eu", seller, buyerWithoutVatId)).toContain("Kunde benötigt");
    expect(reverseChargeBlockedReason("intra_eu", seller, null)).toContain("Erst Kunden");
    expect(reverseChargeBlockedReason("third_country", seller, buyerWithoutVatId)).toBe("");
    expect(reverseChargeBlockedReason("intra_eu", seller, euBuyer)).toBe("");
  });
});
