export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("de-DE");
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
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
  return Math.floor(new Date(y, (m ?? 1) - 1, d ?? 1).getTime() / 1000);
}

export function addDaysUnix(unixSeconds: number, days: number): number {
  return unixSeconds + days * 86400;
}
