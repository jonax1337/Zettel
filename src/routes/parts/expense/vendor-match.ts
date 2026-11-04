import type { Vendor } from "$lib/db/schema";

type MatchableVendor = Pick<Vendor, "name" | "vatId">;

const VENDOR_SLUG_MAX_LENGTH = 60;

function normalizeVatId(vatId: string): string {
  return vatId.replace(/\s+/g, "").toUpperCase();
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

export function findVendorByVatId<V extends MatchableVendor>(
  vendors: V[],
  vatId: string | null,
): V | null {
  if (!vatId) return null;
  const wanted = normalizeVatId(vatId);
  return vendors.find((v) => v.vatId && normalizeVatId(v.vatId) === wanted) ?? null;
}

export function findVendorByName<V extends MatchableVendor>(
  vendors: V[],
  name: string | null,
): V | null {
  const wanted = name ? normalizeName(name) : "";
  if (!wanted) return null;
  return vendors.find((v) => normalizeName(v.name) === wanted) ?? null;
}

/** Exact name first, then a vendor whose name contains the text or is contained in it. */
export function findVendorByNameLoosely<V extends MatchableVendor>(
  vendors: V[],
  name: string | null,
): V | null {
  const exact = findVendorByName(vendors, name);
  if (exact || !name) return exact;
  const wanted = normalizeName(name);
  if (!wanted) return null;
  return (
    vendors.find((v) => {
      const candidate = normalizeName(v.name);
      return candidate !== "" && (candidate.includes(wanted) || wanted.includes(candidate));
    }) ?? null
  );
}

/** Folder name for a vendor's imported PDFs; undefined lets the backend choose its default. */
export function vendorFileSlug(vendor: Pick<Vendor, "vendorNumber" | "name"> | null): string | undefined {
  if (!vendor) return undefined;
  return `${vendor.vendorNumber}-${vendor.name}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, VENDOR_SLUG_MAX_LENGTH);
}
