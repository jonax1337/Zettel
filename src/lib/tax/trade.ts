// Gewerbesteuer-Schätzung (GewStG).
//
// Nur Gewerbetreibende fallen unter die GewSt. Freiberufler (§ 18 EStG —
// Schriftsteller, Programmierer, Designer, Architekten, …) sind explizit
// ausgenommen und zahlen 0 €.
//
// Rechnung:
//   Gewerbeertrag = Gewinn, auf volle 100 € abgerundet (§ 11 Abs. 1 S. 3 GewStG)
//   Messbetrag    = max(0, Gewerbeertrag - 24.500 €) × 3,5 %
//   GewSt         = Messbetrag × Hebesatz
//
// § 35 EStG erlaubt seit VZ 2020 die Anrechnung auf die ESt:
//   estCredit = min(GewSt, 4,0 × Messbetrag)
// → bis Hebesatz 400 % ist GewSt faktisch ESt-neutral, weil komplett
// angerechnet wird. Erst darüber beginnt eine echte Restbelastung.

const GEWERBEERTRAG_ROUNDING_EURO = 100;
const FREIBETRAG_EURO = 24_500;
// Integer ratios: 3,5 % = 35 ‰, Hebesatz 4,1 = 410 %. Float products like 30 * 4.1 land at 122.999… and floor wrongly.
const STEUERMESSZAHL_PROMILLE = 35;
const PROMILLE = 1000;
const PERCENT = 100;
const ANRECHNUNGS_FAKTOR = 4;
const CENTS_PER_EURO = 100;

export interface TradeTaxResult {
  /** Gewerbesteuer in Cent. */
  tradeTax: number;
  /** Anrechenbar auf ESt nach § 35 EStG, in Cent. */
  estCredit: number;
  /** Steuermessbetrag in Cent (informativ für Detail-View). */
  messbetrag: number;
}

/**
 * Schätzt die Gewerbesteuer-Last und die ESt-Anrechnung dafür.
 *
 * @param profitCent Gewinn in Cent.
 * @param hebesatz Multiplikator als Dezimal: `4.0` = 400 %.
 * @param isFreelancer Wenn true → `{ tradeTax: 0, estCredit: 0, messbetrag: 0 }`.
 */
export function estimateTradeTax(
  profitCent: number,
  hebesatz: number,
  isFreelancer: boolean,
): TradeTaxResult {
  if (isFreelancer || profitCent <= 0) {
    return { tradeTax: 0, estCredit: 0, messbetrag: 0 };
  }
  const gewerbeertragEuro =
    Math.floor(profitCent / CENTS_PER_EURO / GEWERBEERTRAG_ROUNDING_EURO) *
    GEWERBEERTRAG_ROUNDING_EURO;
  const ueberFreibetrag = Math.max(0, gewerbeertragEuro - FREIBETRAG_EURO);
  const messbetragEuro = Math.floor((ueberFreibetrag * STEUERMESSZAHL_PROMILLE) / PROMILLE);
  const hebesatzPercent = Math.round(hebesatz * PERCENT);
  const tradeTaxEuro = Math.floor((messbetragEuro * hebesatzPercent) / PERCENT);
  const creditEuro = Math.min(tradeTaxEuro, messbetragEuro * ANRECHNUNGS_FAKTOR);

  return {
    tradeTax: tradeTaxEuro * CENTS_PER_EURO,
    estCredit: creditEuro * CENTS_PER_EURO,
    messbetrag: messbetragEuro * CENTS_PER_EURO,
  };
}
