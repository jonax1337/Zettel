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
    // Credit: min(768, floor(192 * 4.0)) = 768 € → bei 400 % voll anrechenbar
    const r = estimateTradeTax(3_000_000, 4.0, false);
    expect(r.messbetrag).toBe(19_200);
    expect(r.tradeTax).toBe(76_800);
    expect(r.estCredit).toBe(76_800);
  });

  it("rundet den Gewerbeertrag vor dem Freibetrag auf volle 100 € ab (§ 11 Abs. 1 S. 3 GewStG)", () => {
    // 30.099,99 € → Gewerbeertrag 30.000 € → wie 30.000 €: Messbetrag 192 €
    const r = estimateTradeTax(3_009_999, 4.0, false);
    expect(r.messbetrag).toBe(19_200);
    expect(r.tradeTax).toBe(76_800);
  });

  it("Gewinn knapp über dem Freibetrag (24.599 €) → abgerundet 24.500 € → 0 €", () => {
    expect(estimateTradeTax(2_459_900, 4.0, false).messbetrag).toBe(0);
  });

  it("rechnet die GewSt mit dem 4-fachen Messbetrag an (§ 35 EStG ab VZ 2020)", () => {
    // Messbetrag 192 €, Hebesatz 450 % → GewSt 864 €, Credit-Cap = 4.0 * 192 = 768 €
    const r = estimateTradeTax(3_000_000, 4.5, false);
    expect(r.tradeTax).toBe(86_400);
    expect(r.estCredit).toBe(76_800);
  });

  it("Niedriger Hebesatz (300 %) → komplette Anrechnung, GewSt netto neutral", () => {
    // Messbetrag 192 €, GewSt = 576 €, Credit-Cap = 4.0 * 192 = 768 €
    // → estCredit = min(576, 768) = 576 → GewSt vollständig anrechenbar
    const r = estimateTradeTax(3_000_000, 3.0, false);
    expect(r.tradeTax).toBe(57_600);
    expect(r.estCredit).toBe(57_600);
  });

  it("Hoher Hebesatz (500 %) → echte Restbelastung", () => {
    // Messbetrag 192, GewSt = 960, Credit-Cap = 768
    // → Restbelastung = 960 - 768 = 192 €
    const r = estimateTradeTax(3_000_000, 5.0, false);
    expect(r.tradeTax).toBe(96_000);
    expect(r.estCredit).toBe(76_800);
    expect(r.tradeTax - r.estCredit).toBe(19_200);
  });

  it.each([
    // [Gewinn in Cent, Hebesatz, Messbetrag €, GewSt €] — float: 210 * 4.1 = 860.9999…
    [3_050_000, 4.1, 210, 861],
    [2_580_000, 4.6, 45, 207],
    [3_080_000, 4.35, 220, 957],
  ])("Hebesatz ohne Float-Drift: Gewinn %i, Hebesatz %f", (profit, hebesatz, messbetrag, gewst) => {
    const r = estimateTradeTax(profit, hebesatz, false);
    expect(r.messbetrag).toBe(messbetrag * 100);
    expect(r.tradeTax).toBe(gewst * 100);
  });

  it("Verlustfall (negativer Gewinn) → 0 €", () => {
    expect(estimateTradeTax(-1_000_000, 4.0, false)).toEqual({
      tradeTax: 0,
      estCredit: 0,
      messbetrag: 0,
    });
  });

  it("hoher Gewinn: Messbetrag wächst mit 3,5 % des Überschusses über den Freibetrag", () => {
    // 200000 - 24500 = 175500; messbetrag = floor(175500 * 0.035) = 6142 €
    // gewst = floor(6142 * 4.0) = 24568 €
    const r = estimateTradeTax(20_000_000, 4.0, false);
    expect(r.messbetrag).toBe(614_200);
    expect(r.tradeTax).toBe(2_456_800);
    // 100000 - 24500 = 75500 → floor(2642.5) = 2642 €; 400000 - 24500 = 375500 → floor(13142.5) = 13142 €
    expect(estimateTradeTax(10_000_000, 4.0, false)).toEqual({ messbetrag: 264_200, tradeTax: 1_056_800, estCredit: 1_056_800 });
    expect(estimateTradeTax(40_000_000, 4.0, false).messbetrag).toBe(1_314_200);
    expect(estimateTradeTax(40_000_000, 4.0, false).tradeTax).toBe(5_256_800);
  });
});
