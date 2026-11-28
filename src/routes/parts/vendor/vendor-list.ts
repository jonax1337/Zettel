import { EMPTY_VENDOR_FIGURES, type VendorExpenseFigures } from "$lib/db/vendor-overview";
import type { Vendor } from "$lib/db/schema";

export type VendorListRow = Vendor & VendorExpenseFigures;

/** Joins the aggregated expense figures onto the vendors; a vendor without expenses gets empty figures. */
export function withFigures(vendors: readonly Vendor[], figures: ReadonlyMap<number, VendorExpenseFigures>): VendorListRow[] {
  return vendors.map((vendor) => ({ ...vendor, ...(figures.get(vendor.id) ?? EMPTY_VENDOR_FIGURES) }));
}
