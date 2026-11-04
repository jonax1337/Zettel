import { toUnix } from "$lib/utils/date";

const MS_PER_DAY = 86_400_000;

export type TaxYearWindow = {
  yearStart: number;
  /** Last second (inclusive) that counts towards the year's figures. */
  cutoff: number;
  /** Calendar days from January 1st up to and including the cutoff day, at least 1. */
  daysElapsed: number;
  /** 365, or 366 in a leap year. */
  daysInYear: number;
};

/** Counts local calendar days, so a DST switch in between does not shift the result. */
function calendarDaysBetween(from: Date, to: Date): number {
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return (toDay - fromDay) / MS_PER_DAY;
}

/**
 * Past years use their full range, the running year only runs up to `now`.
 * A future year yields a window before its own start, so queries find nothing.
 */
export function resolveTaxYearWindow(year: number, now: number): TaxYearWindow {
  const firstDay = new Date(year, 0, 1);
  const firstDayOfNextYear = new Date(year + 1, 0, 1);
  const yearStart = toUnix(firstDay);
  const cutoff = Math.min(now, toUnix(firstDayOfNextYear) - 1);
  const daysElapsed = Math.max(1, calendarDaysBetween(firstDay, new Date(cutoff * 1000)) + 1);
  const daysInYear = calendarDaysBetween(firstDay, firstDayOfNextYear);
  return { yearStart, cutoff, daysElapsed, daysInYear };
}
