import { invoke } from "@tauri-apps/api/core";

const DISMISSED_KEY_PREFIX = "zettel.onboarding.dismissed";

/** Each database (tenant, sandbox) keeps its own flag, so dismissing one does not hide the wizard in a fresh one. */
export function dismissalKey(dbUrl: string | null): string {
  return dbUrl ? `${DISMISSED_KEY_PREFIX}.${dbUrl}` : DISMISSED_KEY_PREFIX;
}

async function activeDismissalKey(): Promise<string> {
  try {
    return dismissalKey(await invoke<string>("get_active_db_url"));
  } catch {
    return dismissalKey(null);
  }
}

export async function isOnboardingDismissed(): Promise<boolean> {
  try {
    return localStorage.getItem(await activeDismissalKey()) === "1";
  } catch {
    return false;
  }
}

export async function rememberOnboardingDismissed(): Promise<void> {
  try {
    localStorage.setItem(await activeDismissalKey(), "1");
  } catch {
    // Blocked storage only means the wizard is offered again on the next start.
  }
}
