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
const STEUERMESSZAHL = 0.035;
const ANRECHNUNGS_FAKTOR = 4.0;
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
  const messbetragEuro = Math.floor(ueberFreibetrag * STEUERMESSZAHL);
  const tradeTaxEuro = Math.floor(messbetragEuro * hebesatz);
  const creditEuro = Math.min(tradeTaxEuro, Math.floor(messbetragEuro * ANRECHNUNGS_FAKTOR));

  return {
    tradeTax: tradeTaxEuro * CENTS_PER_EURO,
    estCredit: creditEuro * CENTS_PER_EURO,
    messbetrag: messbetragEuro * CENTS_PER_EURO,
  };
}
