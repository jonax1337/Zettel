import type { CustomerSnapshot, Invoice, Settings } from "$lib/db/schema";
import { isBlank } from "$lib/utils/company-completeness";

type SellerFields = Pick<
  Settings,
  | "companyName"
  | "ownerName"
  | "street"
  | "postalCode"
  | "city"
  | "phone"
  | "email"
  | "vatId"
  | "taxNumber"
  | "bankIban"
>;

type BuyerFields = Pick<CustomerSnapshot, "name" | "street" | "postalCode" | "city" | "email">;

export type XrechnungSource = {
  invoice: Pick<Invoice, "buyerReference">;
  company: SellerFields;
  customer: BuyerFields;
};

/** BR-DE-27: the KoSIT validator wants at least three digits in the seller phone number. */
const MIN_PHONE_DIGITS = 3;

/** BR-DE-28: exactly one @, with text on both sides and no blanks. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

function hasAddress(party: { street: string; postalCode: string; city: string }): boolean {
  return !isBlank(party.street) && !isBlank(party.postalCode) && !isBlank(party.city);
}

function hasPhoneNumber(phone: string | null): boolean {
  return (phone?.replace(/\D/g, "").length ?? 0) >= MIN_PHONE_DIGITS;
}

function isEmail(value: string | null): boolean {
  return EMAIL_PATTERN.test(value?.trim() ?? "");
}

/**
 * German labels of everything an XRechnung needs beyond a plain e-invoice
 * (BR-DE-1 to BR-DE-16 and the electronic addresses); empty means exportable.
 */
export function missingXrechnungFields({ invoice, company, customer }: XrechnungSource): string[] {
  const missing: string[] = [];
  if (isBlank(invoice.buyerReference)) missing.push("Leitweg-ID / Käuferreferenz der Rechnung");
  if (isBlank(company.companyName)) missing.push("Firmenname des Verkäufers");
  if (!hasAddress(company)) missing.push("Anschrift des Verkäufers");
  if (isBlank(company.ownerName)) missing.push("Ansprechpartner des Verkäufers (Inhaber:in)");
  if (!hasPhoneNumber(company.phone)) missing.push("Telefonnummer des Verkäufers");
  if (!isEmail(company.email)) missing.push("E-Mail-Adresse des Verkäufers");
  if (isBlank(company.vatId) && isBlank(company.taxNumber)) {
    missing.push("USt-IdNr. oder Steuernummer des Verkäufers");
  }
  if (isBlank(company.bankIban)) missing.push("Zahlungsweg (IBAN des Verkäufers)");
  if (!hasAddress(customer)) missing.push("Anschrift des Kunden");
  if (!isEmail(customer.email)) missing.push("E-Mail-Adresse des Kunden");
  return missing;
}
