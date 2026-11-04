import type { CustomerSnapshot, ReminderLevel } from "$lib/db/schema";
import { parseSnapshot } from "$lib/db/snapshot-json";

export const UNKNOWN_NAME = "—";

const MAX_LEVEL: ReminderLevel = 3;

/** Route param to level; anything but 2 or 3 starts at the first level. */
export function parseReminderLevel(raw: string | undefined): ReminderLevel {
  const level = Number.parseInt(raw ?? "1", 10);
  return level === 2 || level === 3 ? level : 1;
}

/** One level above the highest reminder already sent for the invoice, capped at the last level. */
export function suggestNextLevel(existing: ReminderLevel[]): ReminderLevel {
  const highest = Math.max(0, ...existing);
  return Math.min(MAX_LEVEL, highest + 1) as ReminderLevel;
}

/** Name stored in an invoice's `customerSnapshot` JSON; unreadable snapshots show a dash. */
export function customerNameFromSnapshot(snapshotJson: string): string {
  return parseSnapshot<CustomerSnapshot>(snapshotJson, "Kundensnapshot").name ?? UNKNOWN_NAME;
}
