import { eurStringToCents } from "$lib/utils/money";

/**
 * Cents from a typed hourly rate, or null when the text is no usable rate.
 * `eurStringToCents` yields 0 for unreadable input, which would silently
 * create a project that bills nothing; only an explicit zero counts as 0.
 */
export function parseHourlyRate(text: string): number | null {
  if (!/\d/.test(text)) return null;
  const cents = eurStringToCents(text);
  const explicitZero = !/[1-9]/.test(text);
  if (cents < 0 || (cents === 0 && !explicitZero)) return null;
  return cents;
}
