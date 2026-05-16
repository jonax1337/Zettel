/** All monetary values are stored as Cent (integer) to avoid float drift. */

export function centsToEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

export function eurStringToCents(s: string): number {
  const normalized = s.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}
