const MINUTES_PER_HOUR = 60;
const CENTI_PER_HOUR = 100;

/** Longest duration a single entry may have: one calendar day. */
export const MAX_ENTRY_MINUTES = 24 * MINUTES_PER_HOUR;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 90 -> "1:30" */
export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / MINUTES_PER_HOUR)}:${pad2(minutes % MINUTES_PER_HOUR)}`;
}

/** Seconds as "h:mm:ss" for the running timer. */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / MINUTES_PER_HOUR);
  return `${formatDuration(minutes)}:${pad2(total % MINUTES_PER_HOUR)}`;
}

/** Hundredths of an hour as hours with a decimal comma: 150 -> "1,50" */
export function formatHours(centiHours: number): string {
  return `${Math.floor(centiHours / CENTI_PER_HOUR)},${pad2(centiHours % CENTI_PER_HOUR)}`;
}

const CLOCK_FORMAT = /^(\d+):(\d{1,2})$/;
const DECIMAL_FORMAT = /^(\d+)(?:[.,](\d+))?$/;

/**
 * Minutes from "h:mm" or decimal hours with comma or dot ("1:30", "1,5", "1.5",
 * "2"); null for anything else. Decimal hours are converted with integer
 * arithmetic and rounded to whole minutes.
 */
export function parseDuration(text: string): number | null {
  const input = text.trim();
  const clock = CLOCK_FORMAT.exec(input);
  if (clock) {
    const minutes = Number(clock[2]);
    return minutes < MINUTES_PER_HOUR ? Number(clock[1]) * MINUTES_PER_HOUR + minutes : null;
  }
  const decimal = DECIMAL_FORMAT.exec(input);
  if (!decimal) return null;
  const fraction = decimal[2] ?? "";
  const scale = 10 ** fraction.length;
  const scaledHours = Number(decimal[1] + fraction);
  return Math.round((scaledHours * MINUTES_PER_HOUR) / scale);
}
