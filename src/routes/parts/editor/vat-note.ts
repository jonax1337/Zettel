import type { ReverseChargeType } from "$lib/db/invoices";

/** Why the sheet shows no VAT, or null when it does. */
export function vatExemptNote(isKleinunternehmer: boolean, reverseChargeType: ReverseChargeType): string | null {
  if (isKleinunternehmer) return "Ohne Umsatzsteuerausweis (§ 19 UStG).";
  if (reverseChargeType !== "none") return "Ohne Umsatzsteuer (Reverse-Charge).";
  return null;
}
