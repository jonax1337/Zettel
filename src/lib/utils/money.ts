/** All monetary values are stored as Cent (integer) to avoid float drift. */

export function centsToEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

const THOUSANDS_GROUPED = /^[1-9]\d{0,2}(\.\d{3})+$/;
const PLAIN_DIGITS = /^\d*$/;

/**
 * Parses user-typed euro text into cents. Accepts German ("1.234,56", "119,00")
 * and dot-decimal ("119.00", "12.5") notation. Without a comma, dots followed by
 * exactly three digits are thousands separators ("1.234" = 1234 EUR), any other
 * single dot is the decimal separator. Unparseable input yields 0.
 */
export function eurStringToCents(s: string): number {
  const text = s.replace(/[€\s]/g, "");
  const sign = text.startsWith("-") ? -1 : 1;
  const unsigned = text.replace(/^-/, "");
  if (!/^[\d.,]+$/.test(unsigned)) return 0;

  const [whole, fraction] = splitDecimal(unsigned);
  if (whole === null) return 0;
  const euros = Number.parseInt(whole || "0", 10);
  return sign * (euros * 100 + fractionToCents(fraction)) || 0;
}

/** Returns [wholeDigits, fractionDigits], or [null, ""] when the notation is ambiguous or malformed. */
function splitDecimal(unsigned: string): [string | null, string] {
  const commaParts = unsigned.split(",");
  if (commaParts.length > 2) return [null, ""];
  if (commaParts.length === 2) {
    const [whole, fraction] = commaParts;
    const wellFormed = THOUSANDS_GROUPED.test(whole) || PLAIN_DIGITS.test(whole);
    return wellFormed && PLAIN_DIGITS.test(fraction) ? [whole.replace(/\./g, ""), fraction] : [null, ""];
  }
  if (THOUSANDS_GROUPED.test(unsigned)) return [unsigned.replace(/\./g, ""), ""];
  const dotParts = unsigned.split(".");
  if (dotParts.length > 2) return [null, ""];
  const [whole, fraction = ""] = dotParts;
  return PLAIN_DIGITS.test(whole) && PLAIN_DIGITS.test(fraction) ? [whole, fraction] : [null, ""];
}

/** Rounds the fraction digits to whole cents (half-up on the third digit). */
function fractionToCents(fraction: string): number {
  const padded = `${fraction}00`;
  const cents = Number.parseInt(padded.slice(0, 2), 10);
  return padded[2] >= "5" ? cents + 1 : cents;
}
