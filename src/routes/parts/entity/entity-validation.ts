import { isBlank } from "$lib/utils/company-completeness";
import { INVALID_COUNTRY_MESSAGE, normalizeCountryCode } from "./country";
import type { PartyFields } from "./party-form";

export type PartyErrors = Partial<
  Record<"name" | "street" | "postalCode" | "city" | "country" | "email", string>
>;

export type CatalogErrors = Partial<Record<"name" | "defaultVatRate", string>>;

export const MAX_VAT_RATE_PERCENT = 30;

const DOMAIN_LABEL = "[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?";
/** The WHATWG rule behind <input type="email">, which the forms no longer get because they skip native validation. */
const EMAIL_PATTERN = new RegExp(
  "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@" + DOMAIN_LABEL + "(?:\\." + DOMAIN_LABEL + ")*$",
  "u",
);

/** Customers need a full address for EN16931 e-invoices; vendors may leave it empty. */
export function validateParty(form: PartyFields, options: { requireAddress: boolean }): PartyErrors {
  const errors: PartyErrors = {};
  if (isBlank(form.name)) errors.name = "Gib einen Namen oder eine Firma an.";
  if (options.requireAddress) {
    if (isBlank(form.street)) errors.street = "Gib Straße und Hausnummer an.";
    if (isBlank(form.postalCode)) errors.postalCode = "Gib die PLZ an.";
    if (isBlank(form.city)) errors.city = "Gib den Ort an.";
  }
  if (isBlank(form.country)) errors.country = "Gib das Land als ISO-Code an (z. B. DE).";
  else if (!normalizeCountryCode(form.country)) errors.country = INVALID_COUNTRY_MESSAGE;
  if (!isBlank(form.email) && !EMAIL_PATTERN.test(form.email!.trim())) {
    errors.email = "Gib eine gültige E-Mail-Adresse an.";
  }
  return errors;
}

export function validateCatalogItem(form: { name: string; defaultVatRate: number | null }): CatalogErrors {
  const errors: CatalogErrors = {};
  if (isBlank(form.name)) errors.name = "Gib einen Namen an.";
  const rate = form.defaultVatRate;
  if (rate === null || rate === undefined || Number.isNaN(rate)) {
    errors.defaultVatRate = "Gib den USt-Satz an.";
  } else if (!Number.isInteger(rate) || rate < 0 || rate > MAX_VAT_RATE_PERCENT) {
    errors.defaultVatRate = `Der USt-Satz muss eine ganze Zahl zwischen 0 und ${MAX_VAT_RATE_PERCENT} sein.`;
  }
  return errors;
}
