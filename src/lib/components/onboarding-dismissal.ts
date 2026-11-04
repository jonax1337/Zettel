const DISMISSED_KEY = "zettel.onboarding.dismissed";

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberOnboardingDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Blocked storage only means the wizard is offered again on the next start.
  }
}
