// Gewerbesteuer-Schätzung (GewStG).
//
// Nur Gewerbetreibende fallen unter die GewSt. Freiberufler (§ 18 EStG —
// Schriftsteller, Programmierer, Designer, Architekten, …) sind explizit
// ausgenommen und zahlen 0 €.
//
// Rechnung:
//   Messbetrag = max(0, Gewinn - 24.500 €) × 3,5 %
//   GewSt      = Messbetrag × Hebesatz
//
// § 35 EStG erlaubt die teilweise Anrechnung auf die ESt:
//   estCredit = min(GewSt, 3,8 × Messbetrag)
// → bei Hebesatz < 380 % ist GewSt faktisch ESt-neutral, weil komplett
// angerechnet wird. Erst ab ~380 % beginnt eine echte Restbelastung.

const FREIBETRAG_EURO = 24_500;
const STEUERMESSZAHL = 0.035;
const ANRECHNUNGS_FAKTOR = 3.8;

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
  const profitEuro = Math.floor(profitCent / 100);
  const ueberFreibetrag = Math.max(0, profitEuro - FREIBETRAG_EURO);
  const messbetragEuro = Math.floor(ueberFreibetrag * STEUERMESSZAHL);
  const tradeTaxEuro = Math.floor(messbetragEuro * hebesatz);
  const creditEuro = Math.min(tradeTaxEuro, Math.floor(messbetragEuro * ANRECHNUNGS_FAKTOR));

  return {
    tradeTax: tradeTaxEuro * 100,
    estCredit: creditEuro * 100,
    messbetrag: messbetragEuro * 100,
  };
}
