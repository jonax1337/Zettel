import { addDaysUnix, fromIsoDate, toIsoDate } from "$lib/utils/date";

/** ISO due date for an ISO issue date, or "" while the issue date is incomplete. */
export function dueDateFromIssue(issueDateIso: string, paymentTermsDays: number): string {
  if (!issueDateIso) return "";
  return toIsoDate(addDaysUnix(fromIsoDate(issueDateIso), paymentTermsDays));
}

/**
 * The due date tracks the issue date until the user picks one: a value that
 * still equals the previously derived default is replaced, anything else is kept.
 */
export function followDerivedDueDate(current: string, previousDerived: string, nextDerived: string): string {
  return current === previousDerived ? nextDerived : current;
}
