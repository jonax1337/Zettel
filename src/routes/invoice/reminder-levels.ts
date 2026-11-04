import type { ReminderLevel } from "$lib/db/schema";

export const REMINDER_CREATE_LABEL: Record<ReminderLevel, string> = {
  1: "Erinnerung erstellen",
  2: "Mahnung erstellen",
  3: "Letzte Mahnung erstellen",
};

export function isReminderLevel(level: number): level is ReminderLevel {
  return level === 1 || level === 2 || level === 3;
}

export function nextReminderLevel(existingLevels: ReminderLevel[]): ReminderLevel {
  if (existingLevels.includes(2)) return 3;
  if (existingLevels.includes(1)) return 2;
  return 1;
}
