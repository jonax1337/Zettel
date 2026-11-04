import { SECONDS_PER_DAY } from "$lib/utils/date";

const MESSAGE_SEND_BEFORE_ISSUE = "„Versendet am“ liegt vor dem Rechnungsdatum.";
const MESSAGE_SEND_IN_FUTURE = "„Versendet am“ liegt in der Zukunft.";
const MESSAGE_PAID_BEFORE_SENT = "Zahldatum liegt vor dem Rechnungs- bzw. Versendedatum.";
const MESSAGE_PAID_IN_FUTURE = "Zahldatum liegt in der Zukunft.";

/** One day of slack so "today" never counts as future across timezones. */
function isBeyondToday(ts: number, now: number): boolean {
  return ts > now + SECONDS_PER_DAY;
}

export function sendDateWarning(ts: number, issueDate: number, now: number): string | null {
  if (ts < issueDate) return MESSAGE_SEND_BEFORE_ISSUE;
  if (isBeyondToday(ts, now)) return MESSAGE_SEND_IN_FUTURE;
  return null;
}

export function paidDateWarning(
  ts: number,
  invoice: { sentAt: number | null; issueDate: number },
  now: number,
): string | null {
  if (ts < (invoice.sentAt ?? invoice.issueDate)) return MESSAGE_PAID_BEFORE_SENT;
  if (isBeyondToday(ts, now)) return MESSAGE_PAID_IN_FUTURE;
  return null;
}
