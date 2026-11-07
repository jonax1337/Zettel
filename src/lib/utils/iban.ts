/** Compact form (no spaces, uppercase): what is stored, edited and sent to the sidecar. */
export function normalizeIban(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function isValidIban(raw: string): boolean {
  const s = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  if (s.startsWith("DE") && s.length !== 22) return false;
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    rem = Number(String(rem) + String(parseInt(ch, 36))) % 97;
  }
  return rem === 1;
}
