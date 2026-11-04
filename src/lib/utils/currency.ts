/**
 * Multi-currency support for invoices and offers.
 *
 * Invoices are denominated in their original currency, but DATEV/UStVA always
 * need EUR. We persist the original total plus an EUR-equivalent (computed at
 * issue/save time using a user-supplied exchange rate) so downstream exports
 * don't need to do FX conversion.
 *
 * Out of scope: per-position currency, mixed currencies, automatic FX fetching.
 */

export type CurrencyCode =
  | "EUR"
  | "USD"
  | "GBP"
  | "CHF"
  | "AUD"
  | "CAD"
  | "JPY"
  | "NOK"
  | "SEK"
  | "DKK"
  | "PLN"
  | "CZK";

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "EUR", label: "EUR — Euro" },
  { code: "USD", label: "USD — US-Dollar" },
  { code: "GBP", label: "GBP — Britisches Pfund" },
  { code: "CHF", label: "CHF — Schweizer Franken" },
  { code: "AUD", label: "AUD — Australischer Dollar" },
  { code: "CAD", label: "CAD — Kanadischer Dollar" },
  { code: "JPY", label: "JPY — Japanischer Yen" },
  { code: "NOK", label: "NOK — Norwegische Krone" },
  { code: "SEK", label: "SEK — Schwedische Krone" },
  { code: "DKK", label: "DKK — Dänische Krone" },
  { code: "PLN", label: "PLN — Polnischer Złoty" },
  { code: "CZK", label: "CZK — Tschechische Krone" },
];

export function isValidCurrencyCode(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code);
}

/**
 * Exchange rates are held as BigInt scaled by 1e8: eight fractional digits
 * round-trip every ECB reference rate without loss. A float would silently
 * lose precision once rate * total in cents exceeds 2^53, and BigInt division
 * rounds deterministically.
 */
const RATE_FRACTION_DIGITS = 8;
const RATE_SCALE = 10n ** BigInt(RATE_FRACTION_DIGITS);

/**
 * Parse a user-entered exchange-rate string ("1.0832", "1,0832") into a rate
 * scaled by 1e8. Returns null if the input is unparseable or non-positive.
 */
export function parseExchangeRateScaled(input: string): bigint | null {
  if (!input) return null;
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [intPart, fracPart = ""] = normalized.split(".");
  const scaledFraction = fracPart.padEnd(RATE_FRACTION_DIGITS, "0").slice(0, RATE_FRACTION_DIGITS);
  const scaled = BigInt(intPart + scaledFraction);
  return scaled > 0n ? scaled : null;
}

/**
 * Convert a total in foreign-currency cents to EUR cents using a scaled rate.
 *
 * Rate semantics: "1 EUR = X <FOREIGN>", i.e. 1 USD invoice at rate 1.08 means
 * 1 EUR buys 1.08 USD, so 100 USD cents → 100 * 1e8 / 1.08e8 ≈ 93 EUR cents.
 *
 * Rounding: half-up on the absolute value, sign re-applied (so credit notes
 * mirror their invoices). One division at the document level, not per
 * position, keeps the cumulative error to at most ±1 cent.
 */
export function toEurCents(totalCents: number, rateScaled: bigint): number {
  const total = BigInt(totalCents);
  const negative = total < 0n;
  const numerator = (negative ? -total : total) * RATE_SCALE;
  const quotient = numerator / rateScaled;
  const remainder = numerator % rateScaled;
  const rounded = remainder * 2n >= rateScaled ? quotient + 1n : quotient;
  return Number(negative ? -rounded : rounded);
}

/**
 * Compute eur_total_cent for an invoice or offer. Returns null for an
 * unparseable rate; callers then store nothing in eur_total_cent and the DATEV
 * export falls back to total.
 */
export function computeEurTotalCent(
  currency: string,
  totalCent: number,
  exchangeRate: string | null | undefined,
): number | null {
  if (currency === "EUR") return totalCent;
  if (!exchangeRate) return null;
  const scaled = parseExchangeRateScaled(exchangeRate);
  if (!scaled) return null;
  return toEurCents(totalCent, scaled);
}

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY"]);

/** Format a money amount in any supported currency for display. */
export function formatMoney(cents: number, currency: string): string {
  const code = currency || "EUR";
  const fractionDigits = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
  const value = cents / 100;
  try {
    return value.toLocaleString("de-DE", {
      style: "currency",
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  } catch {
    // Unknown ISO code — fall back to plain formatting.
    return `${value.toFixed(fractionDigits)} ${code}`;
  }
}
