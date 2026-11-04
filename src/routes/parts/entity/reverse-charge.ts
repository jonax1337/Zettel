import type { ReverseChargeType } from "$lib/db/invoices";
import type { Customer, Settings } from "$lib/db/schema";

export const REVERSE_CHARGE_ITEMS: { value: ReverseChargeType; label: string }[] = [
  { value: "none", label: "Keine" },
  { value: "intra_eu", label: "Innergemeinschaftlich (EU-B2B)" },
  { value: "third_country", label: "Ausfuhrlieferung Drittland" },
];

export const REVERSE_CHARGE_HINTS: Record<ReverseChargeType, string> = {
  none: "Inlandsumsatz oder regulärer Umsatzsteuerausweis.",
  intra_eu: "Innergemeinschaftlicher Umsatz an ein EU-Unternehmen. Alle Positionen auf 0 % USt.",
  third_country: "Umsatz an einen Kunden im Drittland. Alle Positionen auf 0 % USt.",
};

type Seller = Pick<Settings, "isKleinunternehmer" | "vatId">;
type Buyer = Pick<Customer, "vatId">;

/**
 * Why the chosen reverse-charge type is not possible, or "" when it is.
 * Never for Kleinunternehmer; both types need the seller's VAT ID, intra-EU
 * also the buyer's. Whether the buyer's country is in the EU stays the user's call.
 */
export function reverseChargeBlockedReason(
  type: ReverseChargeType,
  seller: Seller | null,
  buyer: Buyer | null,
): string {
  if (type === "none" || !seller) return "";
  if (seller.isKleinunternehmer) return "Nicht verfügbar für Kleinunternehmer (§ 19 UStG).";
  if (!seller.vatId) return "Eigene USt-IdNr. in den Einstellungen fehlt.";
  if (type === "intra_eu") {
    if (!buyer) return "Erst Kunden auswählen.";
    if (!buyer.vatId) return "EU-Reverse-Charge: Kunde benötigt USt-IdNr.";
  }
  return "";
}
