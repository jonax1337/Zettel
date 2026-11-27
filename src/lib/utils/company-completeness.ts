import type { Settings } from "$lib/db/schema";

type CompanyFields = Pick<
  Settings,
  "companyName" | "street" | "postalCode" | "city" | "taxNumber" | "vatId"
>;

export const COMPANY_SETTINGS_ROUTE = "/settings/company";
export const TAX_SETTINGS_ROUTE = "/settings/tax";

const TAX_ID_LABEL = "Steuernummer oder USt-IdNr.";

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
    missing.push(TAX_ID_LABEL);
  }
  return missing;
}

/** Where to fill in what missingCompanyData() reported: the tax page when only the tax identification is missing, else the company page. */
export function companySettingsRoute(missing: string[]): string {
  return missing.length > 0 && missing.every((label) => label === TAX_ID_LABEL)
    ? TAX_SETTINGS_ROUTE
    : COMPANY_SETTINGS_ROUTE;
}

function settingsPagesFor(missing: string[]): string {
  const needsTaxPage = missing.includes(TAX_ID_LABEL);
  const needsCompanyPage = missing.some((label) => label !== TAX_ID_LABEL);
  if (needsTaxPage && needsCompanyPage) return "Unternehmen und Steuern";
  return needsTaxPage ? "Steuern" : "Unternehmen";
}

export function companyIncompleteMessage(missing: string[]): string {
  return `Firmendaten unvollständig: ${missing.join(", ")}. Bitte unter Einstellungen → ${settingsPagesFor(missing)} ergänzen.`;
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}
