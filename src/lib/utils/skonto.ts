/**
 * Skonto (Frühzahler-Rabatt) — EN-16931 ApplicableTradePaymentDiscountTerms.
 *
 * Berechnung: Rabatt-Betrag = Gesamt-Brutto × Prozent / 100, abgerundet auf Cent.
 * Frist = Rechnungs-Issue-Date + days. (Nicht due_date — der Skonto-Zeitraum
 * läuft ab Rechnungsausstellung, nicht ab Fälligkeit.)
 *
 * Trigger: percent > 0, days > 0, nicht-Storno, nicht-RC, nicht KU mit 0-Betrag.
 */
import { addDaysUnix } from "./date";

export type SkontoInput = {
  totalCent: number;
  percent: number | null;
  days: number | null;
  /** Unix-Timestamp Rechnungsdatum. */
  issueDate: number;
  isCreditNote?: boolean;
};

export type SkontoResult = {
  discountCent: number;
  /** Letzter Tag mit Skonto-Anspruch, Unix-Timestamp (Tagesgrenze). */
  deadlineUnix: number;
  percent: number;
  days: number;
};

export function isSkontoActive(input: SkontoInput): boolean {
  if (input.isCreditNote) return false;
  if (input.totalCent <= 0) return false;
  const p = input.percent ?? 0;
  const d = input.days ?? 0;
  return p > 0 && d > 0;
}

const BASIS_POINTS_PER_UNIT = 10000;

/** Integer basis points (2,3 % -> 230): `total * 2.3 / 100` drifts in float (3000 * 2.3 = 6899.999...). */
function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

export function computeSkonto(input: SkontoInput): SkontoResult | null {
  if (!isSkontoActive(input)) return null;
  const percent = input.percent!;
  const days = input.days!;
  const discountCent = Math.floor((input.totalCent * percentToBasisPoints(percent)) / BASIS_POINTS_PER_UNIT);
  const deadlineUnix = addDaysUnix(input.issueDate, days);
  return { discountCent, deadlineUnix, percent, days };
}

/** Format the German line "Bei Zahlung bis 28.04.2026: 2 % Skonto = 119,00 €". */
export function formatSkontoLineDe(
  result: SkontoResult,
  centsFormatter: (cents: number) => string,
  dateFormatter: (unix: number) => string,
): string {
  return `Bei Zahlung bis ${dateFormatter(result.deadlineUnix)}: ${result.percent} % Skonto = ${centsFormatter(result.discountCent)}`;
}
