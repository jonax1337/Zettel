import type { Settings } from "$lib/db/schema";
import { companyIncompleteMessage, missingCompanyData } from "$lib/utils/company-completeness";
import type { SidecarError } from "./types";

export const COMPANY_INCOMPLETE_CODE = "company_incomplete";

/**
 * Blocks PDF generation while sender data is missing, before anything is
 * issued or rendered. Returns null when the company data is complete.
 */
export function companyIncompleteResponse(company: Settings): SidecarError | null {
  const missing = missingCompanyData(company);
  if (missing.length === 0) return null;
  return {
    success: false,
    error: {
      code: COMPANY_INCOMPLETE_CODE,
      message: companyIncompleteMessage(missing),
      details: missing.join(", "),
    },
  };
}
