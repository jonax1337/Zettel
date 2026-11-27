import { push } from "svelte-spa-router";
import { loadSettings } from "$lib/db/queries";
import { toast } from "$lib/ui";
import {
  COMPANY_SETTINGS_ROUTE,
  companyIncompleteMessage,
  companySettingsRoute,
  missingCompanyData,
} from "./company-completeness";

/**
 * Gate for "mark as sent": a sent document is final, so it must not go out
 * without sender data. Shows a notice with a link to the settings page that
 * holds what is missing and returns false when data is missing.
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
  notifyCompanyIncomplete(companyIncompleteMessage(missing), companySettingsRoute(missing));
  return false;
}

/** Warning toast with a link to the settings page that holds the missing data. */
export function notifyCompanyIncomplete(description: string, route: string = COMPANY_SETTINGS_ROUTE): void {
  toast.action(
    "Firmendaten unvollständig",
    { label: "Firmendaten ergänzen", onClick: () => push(route) },
    { description, variant: "warning" },
  );
}
