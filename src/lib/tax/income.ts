// Einkommensteuer-Schätzung nach § 32a EStG.
//
// Die Tarifformel ist seit Jahrzehnten strukturell stabil: fünf Zonen mit
// festen Funktionsstücken. Was sich jährlich ändert, sind die Eckwerte
// (Grundfreibetrag + Zonengrenzen) — das BMF veröffentlicht die neuen
// Werte typischerweise im Spätsommer/Herbst des Vorjahres per
// Steuerfortentwicklungsgesetz.
//
// Hier verwendet: § 32a EStG Tarif 2024 (geltend für VZ 2024).
// Update-Pfad: TARIF-Konstante austauschen, golden Tests anpassen.

export type FilingStatus = "single" | "married";

export interface IncomeTaxResult {
  /** Einkommensteuer in Cent. */
  est: number;
  /** Solidaritätszuschlag in Cent. */
  soli: number;
  /** Kirchensteuer in Cent. */
  kist: number;
  /** Summe in Cent (Convenience). */
  total: number;
}

interface TarifZone {
  /** Eingangsfreibetrag — Einkommen darunter bleibt steuerfrei. */
  grundfreibetrag: number;
  /** Obergrenze Zone 2 (Progressionsstufe 1). */
  zone2End: number;
  /** Obergrenze Zone 3 (lineare Progression). */
  zone3End: number;
  /** Obergrenze Zone 4 (42 % Spitzensteuersatz). */
  zone4End: number;
  /** Soli-Freigrenze in Euro (auf die ESt). */
  soliFreigrenze: number;
}

// VZ 2024 — verifiziert gegen amtlichen BMF-Tarifrechner.
const TARIF_2024: TarifZone = {
  grundfreibetrag: 11_604,
  zone2End: 17_005,
  zone3End: 66_760,
  zone4End: 277_825,
  soliFreigrenze: 18_130,
};

/**
 * Berechnet die tarifliche Einkommensteuer für eine zu versteuernde
 * Bemessungsgrundlage in Euro. Floor auf ganze Euro (so wie das FA es macht).
 */
function tariflicheEStEinzeln(zvE: number, tarif: TarifZone): number {
  if (zvE <= tarif.grundfreibetrag) return 0;
  if (zvE <= tarif.zone2End) {
    const y = (zvE - tarif.grundfreibetrag) / 10_000;
    return Math.floor((922.98 * y + 1_400) * y);
  }
  if (zvE <= tarif.zone3End) {
    const z = (zvE - tarif.zone2End) / 10_000;
    return Math.floor((181.19 * z + 2_397) * z + 1_025.38);
  }
  if (zvE <= tarif.zone4End) {
    return Math.floor(0.42 * zvE - 10_602.13);
  }
  return Math.floor(0.45 * zvE - 18_936.88);
}

/**
 * Splittingtarif (§ 32a Abs. 5 EStG): ESt für das halbe Einkommen, dann × 2.
 */
function tariflicheESt(
  zvEEuro: number,
  status: FilingStatus,
  tarif: TarifZone,
): number {
  if (status === "married") {
    return 2 * tariflicheEStEinzeln(zvEEuro / 2, tarif);
  }
  return tariflicheEStEinzeln(zvEEuro, tarif);
}

/**
 * Solidaritätszuschlag mit Milderungszone.
 *
 * Ab 2021 effektiv abgeschafft für ~90 % der Steuerzahler. Volle 5,5 % nur
 * oberhalb der oberen Milderungsgrenze. In der Milderungszone wird linear
 * hochgezogen (§ 4 Abs. 2 SolzG). Faustformel: Soli = min(5,5 % × ESt,
 * 11,9 % × (ESt − Freigrenze)).
 */
function soli(estEuro: number, status: FilingStatus, tarif: TarifZone): number {
  const freigrenze =
    status === "married" ? tarif.soliFreigrenze * 2 : tarif.soliFreigrenze;
  if (estEuro <= freigrenze) return 0;
  const voller = 0.055 * estEuro;
  const milderung = 0.119 * (estEuro - freigrenze);
  return Math.floor(Math.min(voller, milderung));
}

/**
 * Lokale Tarif-Schätzung — § 32a EStG Formel mit eingefrorenen Konstanten.
 * Synchron, deterministisch, offline-fähig. Fallback wenn BMF-API unerreichbar.
 *
 * @param taxableProfitCent Steuerpflichtiges Einkommen in Cent.
 * @param status `'single'` (Grundtarif) oder `'married'` (Splittingtarif).
 * @param churchRate Kirchensteuersatz als Dezimal: `0`, `0.08` (BY, BW) oder
 *   `0.09` (übrige Länder).
 */
export function estimateIncomeTaxLocal(
  taxableProfitCent: number,
  status: FilingStatus,
  churchRate: number,
): IncomeTaxResult {
  const tarif = TARIF_2024;
  const zvEEuro = Math.max(0, Math.floor(taxableProfitCent / 100));
  const estEuro = tariflicheESt(zvEEuro, status, tarif);
  const soliEuro = soli(estEuro, status, tarif);
  const kistEuro = Math.floor(estEuro * churchRate);

  const est = estEuro * 100;
  const soliCent = soliEuro * 100;
  const kistCent = kistEuro * 100;

  return {
    est,
    soli: soliCent,
    kist: kistCent,
    total: est + soliCent + kistCent,
  };
}

export type TaxSource = "bmf" | "local";

export interface IncomeTaxWithSource extends IncomeTaxResult {
  /** Wer hat die Zahlen geliefert? */
  source: TaxSource;
  /** Veranlagungsjahr, das verwendet wurde. */
  year: number;
}

/**
 * Schätzt ESt + Soli + KiSt — primär via BMF-Lohnsteuer-Rechner (autoritative
 * Live-Daten), bei Offline / API-Fehler Fallback auf lokale Formel.
 *
 * Ergebnisse werden 24 h in localStorage gecacht (key
 * `zettel.bmf.<year>:<status>:<zvE>`), damit Dashboard-Renders nicht jedes
 * Mal HTTP-Aufrufe machen. KiSt rechnen wir lokal — sie ist `rate × ESt`,
 * BMF braucht dafür Konfessions-Parameter, die wir vermeiden wollen.
 */
export async function estimateIncomeTax(
  taxableProfitCent: number,
  status: FilingStatus,
  churchRate: number,
  year: number = new Date().getFullYear(),
): Promise<IncomeTaxWithSource> {
  const { fetchBmfIncomeTax } = await import("./bmf");
  const bmf = await fetchBmfIncomeTax(taxableProfitCent, status, year);
  if (bmf) {
    const estEuro = Math.floor(bmf.est / 100);
    const kistCent = Math.floor(estEuro * churchRate) * 100;
    return {
      est: bmf.est,
      soli: bmf.soli,
      kist: kistCent,
      total: bmf.est + bmf.soli + kistCent,
      source: "bmf",
      year: bmf.year,
    };
  }
  const local = estimateIncomeTaxLocal(taxableProfitCent, status, churchRate);
  return { ...local, source: "local", year: 2024 };
}
