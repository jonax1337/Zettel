import { periodForMonth, type Period } from "$lib/dashboard/period";
import { formatDate, toUnix } from "$lib/utils/date";

export type PeriodUnit = "week" | "month";

export type TimePeriod = Period & { unit: PeriodUnit };

const DAYS_PER_WEEK = 7;
const THURSDAY_OFFSET_FROM_MONDAY = 3;
const MS_PER_DAY = 86_400_000;

/** Days since Monday: Monday 0 ... Sunday 6. */
const weekdayIndex = (date: Date) => (date.getDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;

/** ISO 8601: the week belongs to the year of its Thursday. */
function isoWeekNumber(monday: Date): number {
  const thursday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + THURSDAY_OFFSET_FROM_MONDAY);
  // UTC for the day count, so that a daylight saving change cannot shift the quotient.
  const daysIntoYear = (Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate()) -
    Date.UTC(thursday.getFullYear(), 0, 1)) / MS_PER_DAY;
  return Math.floor(daysIntoYear / DAYS_PER_WEEK) + 1;
}

function weekContaining(date: Date): TimePeriod {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - weekdayIndex(date));
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + DAYS_PER_WEEK);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + DAYS_PER_WEEK - 1);
  const start = toUnix(monday);
  return {
    unit: "week",
    start,
    end: toUnix(nextMonday),
    label: `KW ${isoWeekNumber(monday)} · ${formatDate(start)} – ${formatDate(toUnix(sunday))}`,
    type: "custom",
  };
}

function monthContaining(date: Date): TimePeriod {
  return { ...periodForMonth(date.getFullYear(), date.getMonth() + 1), unit: "month" };
}

/** The week (Monday to Sunday) or calendar month the date falls in; `end` is exclusive. */
export function periodContaining(unit: PeriodUnit, date: Date): TimePeriod {
  return unit === "week" ? weekContaining(date) : monthContaining(date);
}

export function shiftPeriod(period: TimePeriod, direction: -1 | 1): TimePeriod {
  const first = new Date(period.start * 1000);
  if (period.unit === "week") {
    return weekContaining(new Date(first.getFullYear(), first.getMonth(), first.getDate() + direction * DAYS_PER_WEEK));
  }
  return monthContaining(new Date(first.getFullYear(), first.getMonth() + direction, 1));
}
