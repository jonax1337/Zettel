// Einkommensteuer-Tarif nach § 32a EStG.
//
// Quelle der Konstanten: amtliche BMF-Bekanntmachung der Tarifformel,
// jeweils im Anschluss an das Gesetzgebungsverfahren (Tarifformel 2024
// per Gesetz zur Freistellung des Existenzminimums 2024, Dez 2024; Tarifformel
// 2025 + 2026 per Steuerfortentwicklungsgesetz Dez 2024).
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

// VZ 2024 — § 32a EStG in der Fassung des Gesetzes zur steuerlichen Freistellung
// des Existenzminimums 2024 (BGBl. 2024 I Nr. 386, rückwirkend ab 1.1.2024):
// Grundfreibetrag 11.784 € statt 11.604 € aus dem Inflationsausgleichsgesetz.
const TARIF_2024: Tarif = {
  grundfreibetrag: 11_784,
  zone2End: 17_005,
  zone3End: 66_760,
  zone4End: 277_825,
  soliFreigrenze: 18_130,
  z2a: 954.80,
  z2b: 1_400,
  z3a: 181.19,
  z3b: 2_397,
  z3c: 991.21,
  z4Offset: 10_636.31,
  z5Offset: 18_971.06,
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

// VZ 2026 — Steuerfortentwicklungsgesetz Dez 2024 (BGBl. 2024 I Nr. 449).
const TARIF_2026: Tarif = {
  grundfreibetrag: 12_348,
  zone2End: 17_799,
  zone3End: 69_878,
  zone4End: 277_825,
  soliFreigrenze: 20_350,
  z2a: 914.51,
  z2b: 1_400,
  z3a: 173.10,
  z3b: 2_397,
  z3c: 1_034.87,
  z4Offset: 11_135.63,
  z5Offset: 19_470.38,
};

const TARIFE: Record<TaxYear, Tarif> = {
  2024: TARIF_2024,
  2025: TARIF_2025,
  2026: TARIF_2026,
};

const SPITZENSTEUERSATZ = 0.42;
const REICHENSTEUERSATZ = 0.45;
const SOLI_RATE = 0.055;
/** Milderungszone (§ 4 Abs. 2 SolzG): Soli steigt mit 11,9 % der ESt über der Freigrenze. */
const SOLI_MILDERUNG_RATE = 0.119;
const EURO_TO_CENT = 100;

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
    return Math.floor(SPITZENSTEUERSATZ * zvEEuro - t.z4Offset);
  }
  return Math.floor(REICHENSTEUERSATZ * zvEEuro - t.z5Offset);
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
  const voller = SOLI_RATE * estEuro;
  const milderung = SOLI_MILDERUNG_RATE * (estEuro - freigrenze);
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
  const zvEEuro = Math.max(0, Math.floor(taxableProfitCent / EURO_TO_CENT));
  const estEuro = tariflicheESt(zvEEuro, status, t);
  const soliEuro = soli(estEuro, status, t);
  const kistEuro = Math.floor(estEuro * churchRate);

  const est = estEuro * EURO_TO_CENT;
  const soliCent = soliEuro * EURO_TO_CENT;
  const kistCent = kistEuro * EURO_TO_CENT;

  return {
    est,
    soli: soliCent,
    kist: kistCent,
    total: est + soliCent + kistCent,
    tarifYear,
  };
}

/**
 * Marginale ESt-Last durch ein zusätzliches Selbst-Einkommen, wenn schon
 * `otherIncomeCent` aus anderer Quelle (Anstellung etc.) versteuert wird.
 *
 * = ESt(otherIncome + selbst) − ESt(otherIncome alleine)
 *
 * Bei otherIncome = 0 ist das Ergebnis identisch zum direkten Solo-Fall.
 * Die Lohnsteuer auf den otherIncome führt der AG bereits ab; dieser
 * marginale Aufschlag ist exakt das, was zusätzlich zurückzulegen ist.
 */
export function marginalIncomeTax(
  selbstProfitCent: number,
  otherIncomeCent: number,
  status: FilingStatus,
  churchRate: number,
  year: number = new Date().getFullYear(),
): IncomeTaxResult {
  const other = Math.max(0, otherIncomeCent);
  const self = Math.max(0, selbstProfitCent);
  const total = estimateIncomeTax(other + self, status, churchRate, year);
  const otherAlone = estimateIncomeTax(other, status, churchRate, year);
  const est = Math.max(0, total.est - otherAlone.est);
  const soli = Math.max(0, total.soli - otherAlone.soli);
  const kist = Math.max(0, total.kist - otherAlone.kist);
  return {
    est,
    soli,
    kist,
    total: est + soli + kist,
    tarifYear: total.tarifYear,
  };
}
