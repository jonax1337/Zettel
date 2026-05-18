import { describe, it, expect } from "vitest";
import { estimateTradeTax } from "./trade";

describe("estimateTradeTax", () => {
  it("Freiberufler zahlen 0 €, kein Credit", () => {
    expect(estimateTradeTax(5_000_000, 4.0, true)).toEqual({
      tradeTax: 0,
      estCredit: 0,
      messbetrag: 0,
    });
  });

  it("Gewinn unter Freibetrag (20.000 €) → keine GewSt", () => {
    expect(estimateTradeTax(2_000_000, 4.0, false)).toEqual({
      tradeTax: 0,
      estCredit: 0,
      messbetrag: 0,
    });
  });

  it("Gewinn exakt am Freibetrag (24.500 €) → 0 €", () => {
    expect(estimateTradeTax(2_450_000, 4.0, false).tradeTax).toBe(0);
  });

  it("Gewinn 30.000 €, Hebesatz 400 %", () => {
    // Über Freibetrag: 30000 - 24500 = 5500
    // Messbetrag: floor(5500 * 0.035) = 192 €
    // GewSt: floor(192 * 4.0) = 768 €
    // Credit: min(768, floor(192 * 3.8)) = min(768, 729) = 729 €
    const r = estimateTradeTax(3_000_000, 4.0, false);
    expect(r.messbetrag).toBe(19_200);
    expect(r.tradeTax).toBe(76_800);
    expect(r.estCredit).toBe(72_900);
  });

  it("Niedriger Hebesatz (300 %) → komplette Anrechnung, GewSt netto neutral", () => {
    // Messbetrag 192 €, GewSt = 576 €, Credit-Cap = 3.8 * 192 = 729 €
    // → estCredit = min(576, 729) = 576 → GewSt vollständig anrechenbar
    const r = estimateTradeTax(3_000_000, 3.0, false);
    expect(r.tradeTax).toBe(57_600);
    expect(r.estCredit).toBe(57_600);
  });

  it("Hoher Hebesatz (500 %) → echte Restbelastung", () => {
    // Messbetrag 192, GewSt = 960, Credit-Cap = 729
    // → Restbelastung = 960 - 729 = 231 €
    const r = estimateTradeTax(3_000_000, 5.0, false);
    expect(r.tradeTax).toBe(96_000);
    expect(r.estCredit).toBe(72_900);
    expect(r.tradeTax - r.estCredit).toBe(23_100);
  });

  it("Verlustfall (negativer Gewinn) → 0 €", () => {
    expect(estimateTradeTax(-1_000_000, 4.0, false)).toEqual({
      tradeTax: 0,
      estCredit: 0,
      messbetrag: 0,
    });
  });

  it("Sehr hoher Gewinn (200k) skaliert linear", () => {
    // 200000 - 24500 = 175500; messbetrag = floor(175500 * 0.035) = 6142 €
    // gewst = floor(6142 * 4.0) = 24568 €
    const r = estimateTradeTax(20_000_000, 4.0, false);
    expect(r.messbetrag).toBe(614_200);
    expect(r.tradeTax).toBe(2_456_800);
  });
});
