import type { ReverseChargeType, SupplyKind } from "$lib/db/invoices";

export type CrossBorderType = Exclude<ReverseChargeType, "none">;

/** New documents default to services: the typical freelancer bills work, not goods. */
export const DEFAULT_SUPPLY_KIND: SupplyKind = "services";

export const SUPPLY_KIND_LABEL: Record<SupplyKind, string> = {
  goods: "Lieferung",
  services: "Sonstige Leistung",
};

export const SUPPLY_KIND_HINT: Record<CrossBorderType, Record<SupplyKind, string>> = {
  intra_eu: {
    goods: "Steuerfreie innergemeinschaftliche Lieferung (§ 6a UStG), UStVA Kennzahl 41.",
    services: "Reverse Charge nach § 13b UStG, nicht steuerbare sonstige Leistung (UStVA Kennzahl 21).",
  },
  third_country: {
    goods: "Steuerfreie Ausfuhrlieferung (§ 4 Nr. 1a UStG), UStVA Kennzahl 43.",
    services: "Leistungsort im Drittland (§ 3a Abs. 2 UStG), nicht steuerbar, UStVA Kennzahl 45.",
  },
};

export const SUPPLY_KIND_ITEMS: { value: SupplyKind; label: string }[] = [
  { value: "services", label: SUPPLY_KIND_LABEL.services },
  { value: "goods", label: SUPPLY_KIND_LABEL.goods },
];
