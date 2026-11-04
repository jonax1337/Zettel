import type { Settings } from "$lib/db/schema";

type CompanyFields = Pick<
  Settings,
  "companyName" | "street" | "postalCode" | "city" | "taxNumber" | "vatId"
>;

export const COMPANY_SETTINGS_ROUTE = "/settings/company";

/**
 * German labels of the company data an invoice, offer or reminder cannot do
 * without (§ 14 UStG: sender name and address, tax number or VAT ID).
 */
export function missingCompanyData(company: CompanyFields): string[] {
  const missing: string[] = [];
  if (isBlank(company.companyName)) missing.push("Firmenname");
  if (isBlank(company.street) || isBlank(company.postalCode) || isBlank(company.city)) {
    missing.push("Anschrift");
  }
  if (isBlank(company.taxNumber) && isBlank(company.vatId)) {
    missing.push("Steuernummer oder USt-IdNr.");
  }
  return missing;
}

export function companyIncompleteMessage(missing: string[]): string {
  return `Firmendaten unvollständig: ${missing.join(", ")}. Bitte unter Einstellungen → Firma ergänzen.`;
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}
