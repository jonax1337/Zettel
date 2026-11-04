import type { ReverseChargeType } from "$lib/db/invoices";

type VatRated = { uid: number; vatRate: number };

/** Per-position VAT rates remembered while reverse charge forces them to 0, keyed by row uid. */
export type VatRateSnapshot = Map<number, number>;

/** Zeroes every non-zero rate in place and remembers the first original rate of each row. */
export function zeroVatRatesRemembering(items: VatRated[], snapshot: VatRateSnapshot): void {
  for (const item of items) {
    if (item.vatRate === 0) continue;
    if (!snapshot.has(item.uid)) snapshot.set(item.uid, item.vatRate);
    item.vatRate = 0;
  }
}

/** Puts remembered rates back on rows still at 0 and empties the snapshot. */
export function restoreVatRates(items: VatRated[], snapshot: VatRateSnapshot): void {
  for (const item of items) {
    const remembered = snapshot.get(item.uid);
    if (remembered !== undefined && item.vatRate === 0) item.vatRate = remembered;
  }
  snapshot.clear();
}

export type ReverseChargeAvailability = {
  senderIsKleinunternehmer: boolean;
  senderVatId: string | null | undefined;
  customer: { vatId: string | null | undefined } | null;
};

export function reverseChargeAvailability(input: ReverseChargeAvailability): Record<Exclude<ReverseChargeType, "none">, boolean> {
  const thirdCountry = !input.senderIsKleinunternehmer && !!input.senderVatId;
  return { third_country: thirdCountry, intra_eu: thirdCountry && !!input.customer?.vatId };
}

/** Why an option is unavailable; empty when everything the sender can offer is selectable. */
export function reverseChargeBlockedReason(input: ReverseChargeAvailability): string {
  if (input.senderIsKleinunternehmer) return "Nicht verfügbar für Kleinunternehmer (§ 19 UStG).";
  if (!input.senderVatId) return "Eigene USt-IdNr. in den Einstellungen fehlt.";
  if (!input.customer) return "Innergemeinschaftlich: erst einen Kunden auswählen.";
  if (!input.customer.vatId) return "Innergemeinschaftlich: Der Kunde benötigt eine USt-IdNr.";
  return "";
}
