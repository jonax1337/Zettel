import { describe, it, expect } from "vitest";
import { estimateIncomeTax, getTarifYear } from "./income";

// Golden-Cases pro Tarifjahr. Jede Annahme ist gegen die § 32a-Formel
// mit den dokumentierten Konstanten von Hand nachgerechnet — wer eine
// Konstante ändert, muss die Erwartungen mit-updaten.
//
// Berechnung der Erwartungen:
//   Zone 2: floor((z2a × y + z2b) × y)      y = (zvE − GF) / 10000
//   Zone 3: floor((z3a × z + z3b) × z + z3c) z = (zvE − Z2end) / 10000
//   Zone 4: floor(0.42 × zvE − z4Offset)
//   Zone 5: floor(0.45 × zvE − z5Offset)
//   Splitting: ESt(zvE/2) × 2
//   Soli:      min(0.055 × ESt, 0.119 × (ESt − Freigrenze)), floor

describe("estimateIncomeTax — Tarif 2024", () => {
  const Y = 2024;

  it("ESt = 0 unter Grundfreibetrag (10.000 €)", () => {
    expect(estimateIncomeTax(1_000_000, "single", 0, Y).est).toBe(0);
  });

  it("ESt = 0 bei genau Grundfreibetrag 11.604 €", () => {
    expect(estimateIncomeTax(1_160_400, "single", 0, Y).est).toBe(0);
  });

  it("Zone 2 — 15.000 € → 581 € ESt", () => {
    // y = 0.3396; (922.98*0.3396 + 1400) * 0.3396 = 581.8855... → 581
    expect(estimateIncomeTax(1_500_000, "single", 0, Y).est).toBe(58_100);
  });

  it("Zone 3 — 50.000 € → 10.906 € ESt", () => {
    // z = 3.2995; (181.19*3.2995 + 2397)*3.2995 + 1025.38 = 10906.85... → 10906
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).est).toBe(1_090_600);
  });

  it("Zone 4 — 100.000 € → 31.397 € ESt", () => {
    // 0.42*100000 - 10602.13 = 31397.87 → 31397
    expect(estimateIncomeTax(10_000_000, "single", 0, Y).est).toBe(3_139_700);
  });

  it("Zone 5 — 300.000 € → 116.063 € ESt", () => {
    // 0.45*300000 - 18936.88 = 116063.12 → 116063
    expect(estimateIncomeTax(30_000_000, "single", 0, Y).est).toBe(11_606_300);
  });

  it("Splittingtarif 100k = 2 × ESt(50k single)", () => {
    expect(estimateIncomeTax(10_000_000, "married", 0, Y).est).toBe(2_181_200);
  });

  it("Splitting-Freibetrag doppelt = 23.208 € → 0 €", () => {
    expect(estimateIncomeTax(2_320_800, "married", 0, Y).est).toBe(0);
  });

  it("Soli = 0 unter Freigrenze (ESt 10.906 € < 18.130 €)", () => {
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).soli).toBe(0);
  });

  it("Soli in Milderungszone (100k single, ESt 31.397)", () => {
    // milderung = 0.119 * (31397 - 18130) = 1578.77 → 1578
    expect(estimateIncomeTax(10_000_000, "single", 0, Y).soli).toBe(157_800);
  });

  it("Soli voller Satz (300k single)", () => {
    // 0.055 * 116063 = 6383.46 → 6383, kleiner als Milderungs-Variante
    expect(estimateIncomeTax(30_000_000, "single", 0, Y).soli).toBe(638_300);
  });

  it("KiSt 9 % auf ESt", () => {
    const r = estimateIncomeTax(5_000_000, "single", 0.09, Y);
    expect(r.kist).toBe(Math.floor(10_906 * 0.09) * 100);
  });

  it("tarifYear echoed", () => {
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).tarifYear).toBe(2024);
  });
});

describe("estimateIncomeTax — Tarif 2025", () => {
  const Y = 2025;

  it("ESt = 0 unter Grundfreibetrag (11.000 €)", () => {
    expect(estimateIncomeTax(1_100_000, "single", 0, Y).est).toBe(0);
  });

  it("ESt = 0 bei genau Grundfreibetrag 12.096 €", () => {
    expect(estimateIncomeTax(1_209_600, "single", 0, Y).est).toBe(0);
  });

  it("Zone 2 — 15.000 € → ESt nach Formel", () => {
    // y = (15000-12096)/10000 = 0.2904
    // (932.30*0.2904 + 1400)*0.2904 = (270.74 + 1400)*0.2904 = 1670.74*0.2904
    // = 485.18 → 485
    expect(estimateIncomeTax(1_500_000, "single", 0, Y).est).toBe(48_500);
  });

  it("Zone 3 — 50.000 € → ESt nach Formel", () => {
    // z = (50000-17443)/10000 = 3.2557
    // (176.64*3.2557 + 2397)*3.2557 + 1015.13
    // = (575.07 + 2397)*3.2557 + 1015.13 = 2972.07*3.2557 + 1015.13
    // = 9676.40 + 1015.13 = 10691.54 → 10691
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).est).toBe(1_069_100);
  });

  it("Zone 4 — 100.000 € → 31.088 € ESt", () => {
    // 0.42*100000 - 10911.92 = 31088.08 → 31088
    expect(estimateIncomeTax(10_000_000, "single", 0, Y).est).toBe(3_108_800);
  });

  it("Zone 5 — 300.000 € → 115.753 € ESt", () => {
    // 0.45*300000 - 19246.67 = 115753.33 → 115753
    expect(estimateIncomeTax(30_000_000, "single", 0, Y).est).toBe(11_575_300);
  });

  it("Splittingtarif für 100k = 2 × ESt(50k single)", () => {
    // 2 × 10691 = 21382
    expect(estimateIncomeTax(10_000_000, "married", 0, Y).est).toBe(2_138_200);
  });

  it("Soli = 0 unter Freigrenze 19.950 € (50k single, ESt 10.691)", () => {
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).soli).toBe(0);
  });

  it("Soli in Milderungszone (100k single)", () => {
    // milderung = 0.119 * (31088 - 19950) = 0.119*11138 = 1325.42 → 1325
    expect(estimateIncomeTax(10_000_000, "single", 0, Y).soli).toBe(132_500);
  });

  it("tarifYear = 2025", () => {
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).tarifYear).toBe(2025);
  });
});

describe("estimateIncomeTax — Tarif 2026", () => {
  const Y = 2026;

  it("ESt = 0 unter Grundfreibetrag 12.348 €", () => {
    expect(estimateIncomeTax(1_234_800, "single", 0, Y).est).toBe(0);
    expect(estimateIncomeTax(1_234_700, "single", 0, Y).est).toBe(0);
  });

  it("Zone 2 — 15.000 € → ESt nach Formel", () => {
    // y = (15000-12348)/10000 = 0.2652
    // (949.94*0.2652 + 1400)*0.2652 = (251.92 + 1400)*0.2652 = 1651.92*0.2652
    // = 438.09 → 438
    expect(estimateIncomeTax(1_500_000, "single", 0, Y).est).toBe(43_800);
  });

  it("Zone 3 — 50.000 € → ESt nach Formel", () => {
    // z = (50000-17799)/10000 = 3.2201
    // (173.30*3.2201 + 2397)*3.2201 + 1013.65
    // = (558.04 + 2397)*3.2201 + 1013.65 = 2955.04*3.2201 + 1013.65
    // = 9515.43 + 1013.65 = 10529.08 → 10529
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).est).toBe(1_052_900);
  });

  it("Zone 4 — 100.000 € → 30.870 € ESt", () => {
    // 0.42*100000 - 11129.62 = 30870.38 → 30870
    expect(estimateIncomeTax(10_000_000, "single", 0, Y).est).toBe(3_087_000);
  });

  it("Zone 5 — 300.000 € → 115.535 € ESt", () => {
    // 0.45*300000 - 19464.37 = 115535.63 → 115535
    expect(estimateIncomeTax(30_000_000, "single", 0, Y).est).toBe(11_553_500);
  });

  it("Splittingtarif für 100k", () => {
    // 2 × 10529 = 21058
    expect(estimateIncomeTax(10_000_000, "married", 0, Y).est).toBe(2_105_800);
  });

  it("Soli = 0 unter Freigrenze 20.350 €", () => {
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).soli).toBe(0);
  });

  it("KiSt 8 % BY", () => {
    const r = estimateIncomeTax(5_000_000, "single", 0.08, Y);
    expect(r.kist).toBe(Math.floor(10_529 * 0.08) * 100);
  });

  it("tarifYear = 2026", () => {
    expect(estimateIncomeTax(5_000_000, "single", 0, Y).tarifYear).toBe(2026);
  });
});

describe("estimateIncomeTax — Cross-Year-Eigenschaften", () => {
  it("Steuerlast sinkt 2024 → 2025 → 2026 für gleiches Einkommen", () => {
    // Grundfreibetrag wird angehoben → ESt sinkt bei gleichem zvE.
    const e24 = estimateIncomeTax(5_000_000, "single", 0, 2024).est;
    const e25 = estimateIncomeTax(5_000_000, "single", 0, 2025).est;
    const e26 = estimateIncomeTax(5_000_000, "single", 0, 2026).est;
    expect(e25).toBeLessThan(e24);
    expect(e26).toBeLessThan(e25);
  });

  it("Splittingtarif spart bei jedem Jahr Steuern (married < single)", () => {
    for (const y of [2024, 2025, 2026] as const) {
      const single = estimateIncomeTax(10_000_000, "single", 0, y).est;
      const married = estimateIncomeTax(10_000_000, "married", 0, y).est;
      expect(married).toBeLessThan(single);
    }
  });

  it("total = est + soli + kist (alle Jahre)", () => {
    for (const y of [2024, 2025, 2026] as const) {
      const r = estimateIncomeTax(10_000_000, "single", 0.09, y);
      expect(r.total).toBe(r.est + r.soli + r.kist);
    }
  });
});

describe("getTarifYear — Year fallback", () => {
  it("hinterlegte Jahre direkt zurück", () => {
    expect(getTarifYear(2024)).toBe(2024);
    expect(getTarifYear(2025)).toBe(2025);
    expect(getTarifYear(2026)).toBe(2026);
  });

  it("Zukunfts-Jahre → neuestes hinterlegtes Jahr", () => {
    expect(getTarifYear(2027)).toBe(2026);
    expect(getTarifYear(2030)).toBe(2026);
  });

  it("alte Jahre vor unserer Range → ebenfalls neuestes", () => {
    // Bewusst kein Backwards-Mapping — 2020er-Tarife sind irrelevant
    expect(getTarifYear(2020)).toBe(2026);
  });
});
