import { push } from "svelte-spa-router";
import { loadSettings } from "$lib/db/queries";
import { toast } from "$lib/ui";
import {
  COMPANY_SETTINGS_ROUTE,
  companyIncompleteMessage,
  missingCompanyData,
} from "./company-completeness";

/**
 * Gate for "mark as sent": a sent document is final, so it must not go out
 * without sender data. Shows a notice with a link to the company settings and
 * returns false when data is missing.
 */
export async function ensureCompanyDataComplete(): Promise<boolean> {
  let missing: string[];
  try {
    missing = missingCompanyData(await loadSettings());
  } catch (e) {
    toast.error("Firmendaten konnten nicht geprüft werden", String(e));
    return false;
  }
  if (missing.length === 0) return true;
  toast.action(
    "Firmendaten unvollständig",
    { label: "Firmendaten ergänzen", onClick: () => push(COMPANY_SETTINGS_ROUTE) },
    { description: companyIncompleteMessage(missing), variant: "warning" },
  );
  return false;
}
