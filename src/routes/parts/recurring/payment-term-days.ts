import { SECONDS_PER_DAY } from "$lib/utils/date";

/** Days between issue and due date, or `fallbackDays` when the invoice was due the day it was issued. */
export function paymentTermDays(issueDate: number, dueDate: number, fallbackDays: number): number {
  const days = Math.max(0, Math.round((dueDate - issueDate) / SECONDS_PER_DAY));
  return days || fallbackDays;
}
