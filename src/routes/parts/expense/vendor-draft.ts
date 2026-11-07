import type { VendorInput } from "$lib/db/queries";
import type { PdfReadOutcome } from "./pdf-import";
import { normalizeCountryCode } from "../entity/country";

const DEFAULT_COUNTRY = "DE";

export function emptyVendorDraft(): VendorInput {
  return {
    name: "",
    contactPerson: null,
    street: "",
    postalCode: "",
    city: "",
    country: DEFAULT_COUNTRY,
    email: null,
    phone: null,
    vatId: null,
    bankName: null,
    bankIban: null,
    bankBic: null,
    defaultCategory: null,
    notes: null,
  };
}

/** Prefills a new vendor from what the imported PDF says about its seller; null when it says nothing. */
export function vendorDraftFromOutcome(outcome: PdfReadOutcome): VendorInput | null {
  if (outcome.kind === "zugferd") {
    const { seller } = outcome.data;
    return {
      ...emptyVendorDraft(),
      name: seller.name ?? "",
      street: seller.street,
      postalCode: seller.postalCode,
      city: seller.city,
      country: normalizeCountryCode(seller.country) ?? DEFAULT_COUNTRY,
      email: seller.email,
      vatId: seller.vatId,
    };
  }
  if (outcome.kind === "text" && (outcome.data.vendorName || outcome.data.vendorVatId)) {
    return {
      ...emptyVendorDraft(),
      name: outcome.data.vendorName ?? "",
      vatId: outcome.data.vendorVatId,
    };
  }
  return null;
}
