import { SECONDS_PER_DAY } from "$lib/utils/date";

/** Whole days since the due date; less than a day gives 0. */
export function daysOverdue(dueDate: number, now: number): number {
  return Math.max(0, Math.floor((now - dueDate) / SECONDS_PER_DAY));
}

export function overdueLabel(days: number): string {
  if (days < 1) return "Überfällig";
  return `${days} ${days === 1 ? "Tag" : "Tage"} überfällig`;
}
