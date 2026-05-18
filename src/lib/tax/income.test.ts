import { describe, it, expect } from "vitest";
import { estimateIncomeTax } from "./income";

// Golden-Cases gegen den amtlichen BMF-Tarif­rechner 2024 (§ 32a EStG).
// Wenn der Tarif aktualisiert wird, müssen diese Werte mitgeführt werden.

describe("estimateIncomeTax — Grundtarif (single)", () => {
  it("ESt = 0 bei Einkommen unter Grundfreibetrag", () => {
    const r = estimateIncomeTax(1_000_000, "single", 0); // 10.000 €
    expect(r.est).toBe(0);
    expect(r.soli).toBe(0);
    expect(r.kist).toBe(0);
  });

  it("ESt = 0 bei genau Grundfreibetrag 11.604 €", () => {
    expect(estimateIncomeTax(1_160_400, "single", 0).est).toBe(0);
  });

  it("Zone 2 — Einstiegsprogression bei 15.000 €", () => {
    // y = (15000-11604)/10000 = 0.3396; ESt = (922.98*0.3396 + 1400)*0.3396
    //   = (313.44 + 1400) * 0.3396 = 1713.44 * 0.3396 ≈ 581.88 → floor 581
    expect(estimateIncomeTax(1_500_000, "single", 0).est).toBe(58_100);
  });

  it("Zone 3 — lineare Progression bei 50.000 €", () => {
    // z = (50000-17005)/10000 = 3.2995
    // ESt = (181.19 * 3.2995 + 2397) * 3.2995 + 1025.38 ≈ 10.906,85 → floor 10906
    expect(estimateIncomeTax(5_000_000, "single", 0).est).toBe(1_090_600);
  });

  it("Zone 4 — 42 % Spitzensteuersatz bei 100.000 €", () => {
    // ESt = 0.42 * 100000 - 10602.13 = 31.397,87 → floor 31397
    expect(estimateIncomeTax(10_000_000, "single", 0).est).toBe(3_139_700);
  });

  it("Zone 5 — Reichensteuer 45 % bei 300.000 €", () => {
    // ESt = 0.45 * 300000 - 18936.88 = 116.063,12 → floor 116063
    expect(estimateIncomeTax(30_000_000, "single", 0).est).toBe(11_606_300);
  });
});

describe("estimateIncomeTax — Splittingtarif (married)", () => {
  it("Doppeltes Grundfreibetrag-Niveau (23.208 €)", () => {
    expect(estimateIncomeTax(2_320_800, "married", 0).est).toBe(0);
  });

  it("Bei 100.000 € Splittingtarif < Einzeltarif", () => {
    const splitting = estimateIncomeTax(10_000_000, "married", 0).est;
    const single = estimateIncomeTax(10_000_000, "single", 0).est;
    expect(splitting).toBeLessThan(single);
    // Splittingtarif für 100k = 2 × ESt(50k) = 2 × 10906 = 21812 €
    expect(splitting).toBe(2_181_200);
  });
});

describe("estimateIncomeTax — Solidaritätszuschlag", () => {
  it("Soli = 0 unter Freigrenze (50k Einkommen single)", () => {
    // ESt 10.905 € < Freigrenze 18.130 € → Soli = 0
    expect(estimateIncomeTax(5_000_000, "single", 0).soli).toBe(0);
  });

  it("Soli > 0 in Milderungszone (100k single)", () => {
    // ESt 31.397 € > Freigrenze 18.130 €
    // Milderungs-Soli = 0.119 * (31397 - 18130) = 0.119 * 13267 = 1578.77 → 1578 €
    // Voller Soli = 0.055 * 31397 = 1726.83 → 1726 €
    // min(1578, 1726) = 1578
    expect(estimateIncomeTax(10_000_000, "single", 0).soli).toBe(157_800);
  });

  it("Voller Soli (5,5 %) bei sehr hohem Einkommen", () => {
    // 300k single → ESt 116.063 €, voller Soli 0.055*116063 = 6383 €
    // Milderung 0.119*(116063-18130) = 11653 €
    // min(6383, 11653) = 6383 (voller Satz greift)
    expect(estimateIncomeTax(30_000_000, "single", 0).soli).toBe(638_300);
  });
});

describe("estimateIncomeTax — Kirchensteuer", () => {
  it("KiSt 9 % auf ESt", () => {
    const r = estimateIncomeTax(5_000_000, "single", 0.09);
    expect(r.kist).toBe(Math.floor(10_906 * 0.09) * 100);
  });

  it("KiSt 8 % auf ESt", () => {
    const r = estimateIncomeTax(5_000_000, "single", 0.08);
    expect(r.kist).toBe(Math.floor(10_906 * 0.08) * 100);
  });

  it("KiSt = 0 wenn rate = 0", () => {
    expect(estimateIncomeTax(5_000_000, "single", 0).kist).toBe(0);
  });
});

describe("estimateIncomeTax — total", () => {
  it("total = est + soli + kist", () => {
    const r = estimateIncomeTax(10_000_000, "single", 0.09);
    expect(r.total).toBe(r.est + r.soli + r.kist);
  });
});
