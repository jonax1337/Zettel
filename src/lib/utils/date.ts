export const SECONDS_PER_DAY = 86_400;

export const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export const MONTHS_DE_SHORT = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("de-DE");
}

/** Local date and time, e.g. "22.05.2026, 14:30". */
export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function nowUnix(): number {
  return toUnix(new Date());
}

export function toUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** ISO date (YYYY-MM-DD) for <input type="date">, in local time. */
export function toIsoDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse YYYY-MM-DD as local midnight unix seconds. */
export function fromIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  return toUnix(new Date(y, (m ?? 1) - 1, d ?? 1));
}

/** Local midnight of the given day, unix seconds. */
export function startOfDayUnix(date: Date): number {
  return toUnix(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** Shifts by calendar days in local time, so the wall-clock time survives DST changes. */
export function addDaysUnix(unixSeconds: number, days: number): number {
  const shifted = new Date(unixSeconds * 1000);
  shifted.setDate(shifted.getDate() + days);
  return toUnix(shifted);
}
