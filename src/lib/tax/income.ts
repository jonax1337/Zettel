// Einkommensteuer-Tarif nach § 32a EStG.
//
// Quelle der Konstanten: amtliche BMF-Bekanntmachung der Tarifformel,
// jeweils im Anschluss an das Gesetzgebungsverfahren (Tarifformel 2024
// per Inflationsausgleichsgesetz Nov 2022; Tarifformel 2025 + 2026 per
// Steuerfortentwicklungsgesetz Dez 2024).
//
// Die § 32a-Formel ist strukturell stabil: 5 Zonen (Grundfreibetrag,
// Einstiegsprogression, lineare Progression, Spitzensteuersatz 42 %,
// Reichensteuer 45 %). Was sich jährlich ändert: Grundfreibetrag,
// Zonengrenzen und die quadratischen/linearen Coefficients.
//
// Verifizierbar gegen `bmf-steuerrechner.de` (Web-UI, Lohnsteuer-Rechner
// VZ 20XX, LZZ Jahr, StKl 1 oder 3, Brutto = zvE) — kein Partner-Code
// nötig wenn man's manuell tippt.

export type FilingStatus = "single" | "married";
export type TaxYear = 2024 | 2025 | 2026;

export interface IncomeTaxResult {
  /** Einkommensteuer in Cent. */
  est: number;
  /** Solidaritätszuschlag in Cent. */
  soli: number;
  /** Kirchensteuer in Cent. */
  kist: number;
  /** Summe (est + soli + kist) in Cent. */
  total: number;
  /** Tarifjahr, das tatsächlich gerechnet wurde. */
  tarifYear: TaxYear;
}

interface Tarif {
  /** Eingangsfreibetrag in Euro. */
  grundfreibetrag: number;
  /** Obergrenze Zone 2 (Einstiegsprogression). */
  zone2End: number;
  /** Obergrenze Zone 3 (lineare Progression). */
  zone3End: number;
  /** Obergrenze Zone 4 (42 % Spitzensteuersatz). */
  zone4End: number;
  /** Soli-Freigrenze (auf die tarifliche ESt, single). */
  soliFreigrenze: number;
  /** Zone 2: ESt = (z2a × y + z2b) × y, wobei y = (zvE − Grundfreibetrag) / 10000. */
  z2a: number;
  z2b: number;
  /** Zone 3: ESt = (z3a × z + z3b) × z + z3c, wobei z = (zvE − zone2End) / 10000. */
  z3a: number;
  z3b: number;
  z3c: number;
  /** Zone 4: ESt = 0.42 × zvE − z4Offset. */
  z4Offset: number;
  /** Zone 5: ESt = 0.45 × zvE − z5Offset. */
  z5Offset: number;
}

// VZ 2024 — Tarifformel laut amtl. Bekanntmachung BMF/BGBl.
// Verifiziert gegen 6 Eckpunkte des amtlichen Tarifrechners (siehe Tests).
const TARIF_2024: Tarif = {
  grundfreibetrag: 11_604,
  zone2End: 17_005,
  zone3End: 66_760,
  zone4End: 277_825,
  soliFreigrenze: 18_130,
  z2a: 922.98,
  z2b: 1_400,
  z3a: 181.19,
  z3b: 2_397,
  z3c: 1_025.38,
  z4Offset: 10_602.13,
  z5Offset: 18_936.88,
};

// VZ 2025 — Steuerfortentwicklungsgesetz Dez 2024.
const TARIF_2025: Tarif = {
  grundfreibetrag: 12_096,
  zone2End: 17_443,
  zone3End: 68_480,
  zone4End: 277_825,
  soliFreigrenze: 19_950,
  z2a: 932.30,
  z2b: 1_400,
  z3a: 176.64,
  z3b: 2_397,
  z3c: 1_015.13,
  z4Offset: 10_911.92,
  z5Offset: 19_246.67,
};

// VZ 2026 — Steuerfortentwicklungsgesetz Dez 2024 (Grundfreibetrag-
// Anhebung auf 12.348 € + linear angepasste Tarif-Eckwerte).
const TARIF_2026: Tarif = {
  grundfreibetrag: 12_348,
  zone2End: 17_799,
  zone3End: 69_798,
  zone4End: 277_825,
  soliFreigrenze: 20_350,
  z2a: 949.94,
  z2b: 1_400,
  z3a: 173.30,
  z3b: 2_397,
  z3c: 1_013.65,
  z4Offset: 11_129.62,
  z5Offset: 19_464.37,
};

const TARIFE: Record<TaxYear, Tarif> = {
  2024: TARIF_2024,
  2025: TARIF_2025,
  2026: TARIF_2026,
};

/** Höchstes hinterlegtes Tarifjahr — Fallback für Jahre außerhalb der Range. */
const LATEST_TARIF_YEAR: TaxYear = 2026;

export function getTarifYear(year: number): TaxYear {
  if (year in TARIFE) return year as TaxYear;
  // Zukunfts-Jahre nutzen das jeweils neueste hinterlegte Tarifjahr — Code
  // muss in der jeweiligen Spätsommer-Iteration mit neuem TARIF_YYYY und
  // Tests erweitert werden.
  return LATEST_TARIF_YEAR;
}

function tariflicheEStSingle(zvEEuro: number, t: Tarif): number {
  if (zvEEuro <= t.grundfreibetrag) return 0;
  if (zvEEuro <= t.zone2End) {
    const y = (zvEEuro - t.grundfreibetrag) / 10_000;
    return Math.floor((t.z2a * y + t.z2b) * y);
  }
  if (zvEEuro <= t.zone3End) {
    const z = (zvEEuro - t.zone2End) / 10_000;
    return Math.floor((t.z3a * z + t.z3b) * z + t.z3c);
  }
  if (zvEEuro <= t.zone4End) {
    return Math.floor(0.42 * zvEEuro - t.z4Offset);
  }
  return Math.floor(0.45 * zvEEuro - t.z5Offset);
}

/** Splittingtarif (§ 32a Abs. 5): ESt für (zvE / 2) × 2. */
function tariflicheESt(zvEEuro: number, status: FilingStatus, t: Tarif): number {
  if (status === "married") {
    return 2 * tariflicheEStSingle(zvEEuro / 2, t);
  }
  return tariflicheEStSingle(zvEEuro, t);
}

/**
 * Soli mit Milderungszone (§ 4 Abs. 2 SolzG).
 *
 * Freigrenze auf die ESt: bis dahin = 0. Darüber min(5,5 % × ESt,
 * 11,9 % × (ESt − Freigrenze)). Splittingtarif: Freigrenze × 2.
 */
function soli(estEuro: number, status: FilingStatus, t: Tarif): number {
  const freigrenze = status === "married" ? t.soliFreigrenze * 2 : t.soliFreigrenze;
  if (estEuro <= freigrenze) return 0;
  const voller = 0.055 * estEuro;
  const milderung = 0.119 * (estEuro - freigrenze);
  return Math.floor(Math.min(voller, milderung));
}

/**
 * Schätzt ESt + Soli + KiSt für ein zu versteuerndes Einkommen.
 *
 * @param taxableProfitCent Steuerpflichtiges Einkommen in Cent (= Gewinn
 *   nach Werbungskosten; vereinfacht: Umsatz netto − Aufwand netto).
 * @param status `'single'` (Grundtarif) oder `'married'` (Splittingtarif).
 * @param churchRate Kirchensteuersatz als Dezimal: 0 / 0.08 / 0.09.
 * @param year Veranlagungsjahr — Default = laufendes Kalenderjahr.
 *   Außerhalb der hinterlegten Jahre (2024-2026) wird das jeweils
 *   neueste hinterlegte Tarifjahr genutzt.
 */
export function estimateIncomeTax(
  taxableProfitCent: number,
  status: FilingStatus,
  churchRate: number,
  year: number = new Date().getFullYear(),
): IncomeTaxResult {
  const tarifYear = getTarifYear(year);
  const t = TARIFE[tarifYear];
  const zvEEuro = Math.max(0, Math.floor(taxableProfitCent / 100));
  const estEuro = tariflicheESt(zvEEuro, status, t);
  const soliEuro = soli(estEuro, status, t);
  const kistEuro = Math.floor(estEuro * churchRate);

  const est = estEuro * 100;
  const soliCent = soliEuro * 100;
  const kistCent = kistEuro * 100;

  return {
    est,
    soli: soliCent,
    kist: kistCent,
    total: est + soliCent + kistCent,
    tarifYear,
  };
}
