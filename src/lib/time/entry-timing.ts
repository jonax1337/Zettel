import { startOfDayUnix } from "$lib/utils/date";
import { MAX_ENTRY_MINUTES } from "./duration";

const SECONDS_PER_MINUTE = 60;

/** A manual entry is either a clock range on its day or a plain duration. */
export type TimeEntryTiming =
  | { mode: "range"; startedAt: number; endedAt: number }
  | { mode: "duration"; durationMinutes: number };

export type ResolvedTiming = {
  startedAt: number | null;
  endedAt: number | null;
  durationMinutes: number;
};

const dayOf = (unixSeconds: number) => startOfDayUnix(new Date(unixSeconds * 1000));

/** Minutes between two instants, at least one so that a stopped timer never bills nothing. */
export function elapsedMinutes(startedAt: number, endedAt: number): number {
  return Math.max(1, Math.round((endedAt - startedAt) / SECONDS_PER_MINUTE));
}

/** Validated columns for a manual entry on `entryDate`; throws a German message otherwise. */
export function resolveTiming(entryDate: number, timing: TimeEntryTiming): ResolvedTiming {
  if (timing.mode === "duration") {
    const { durationMinutes } = timing;
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > MAX_ENTRY_MINUTES) {
      throw new Error("Die Dauer muss zwischen 0:01 und 24:00 Stunden liegen.");
    }
    return { startedAt: null, endedAt: null, durationMinutes };
  }
  const { startedAt, endedAt } = timing;
  if (endedAt <= startedAt) throw new Error("Das Ende muss nach dem Beginn liegen.");
  if (dayOf(startedAt) !== entryDate || dayOf(endedAt) !== entryDate) {
    throw new Error("Beginn und Ende müssen am Tag des Eintrags liegen.");
  }
  return { startedAt, endedAt, durationMinutes: elapsedMinutes(startedAt, endedAt) };
}
