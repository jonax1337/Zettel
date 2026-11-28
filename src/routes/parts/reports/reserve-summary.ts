/** Which of the two computed scenarios the reserve page shows; the keys are those of TaxRücklageResult. */
export type ReserveView = "ytd" | "projected";

export const DEFAULT_RESERVE_VIEW: ReserveView = "projected";

export const RESERVE_VIEW_ITEMS: { value: ReserveView; label: string }[] = [
  { value: "ytd", label: "Stand heute" },
  { value: "projected", label: "Aufs Jahr hochgerechnet" },
];

export const RESERVE_VIEW_DESCRIPTIONS: Record<ReserveView, string> = {
  ytd: "Steuerlast aus dem, was du bis heute wirklich erwirtschaftet hast. Konservativ, ohne Hochrechnung. Sinnvoll früh im Jahr oder bei stark schwankenden Einnahmen.",
  projected:
    "Linear aufs Jahr hochgerechnet. Sinnvoll, wenn deine bisherigen Zahlen den Jahresverlauf gut abbilden.",
};

export type PrepaymentStatus =
  | { kind: "none" }
  /** Prepayments exist, but the estimate has no tax burden (loss or zero) to set them against. */
  | { kind: "no-burden"; surplusCent: number }
  | {
      kind: "against-burden";
      /** Share of the burden the prepayments cover, 0 to 100. */
      percent: number;
      /** What the prepayments exceed the burden by; 0 while the burden is not fully covered. */
      surplusCent: number;
    };

/** What the prepayments mean for the reserve; decided on the prepayments first, then on the burden. */
export function prepaymentStatus(totalTaxBurdenCent: number, prepaymentsCent: number): PrepaymentStatus {
  if (prepaymentsCent <= 0) return { kind: "none" };
  if (totalTaxBurdenCent <= 0) return { kind: "no-burden", surplusCent: prepaymentsCent };
  return {
    kind: "against-burden",
    percent: Math.min(100, Math.round((prepaymentsCent / totalTaxBurdenCent) * 100)),
    surplusCent: Math.max(0, prepaymentsCent - totalTaxBurdenCent),
  };
}
