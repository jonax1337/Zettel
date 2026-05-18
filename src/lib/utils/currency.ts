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

/** Loose check — allow user to type any 3-letter code, but reject obvious garbage. */
export function isValidCurrencyCode(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code);
}

/**
 * Parse a user-entered exchange-rate string ("1.0832", "1,0832") into a
 * BigInt scaled by 1e8. We keep eight fractional digits — that's enough to
 * round-trip every ECB reference rate without loss. Returns null if the input
 * is unparseable or non-positive.
 *
 * Why BigInt fixed-point: rate * total in cents can comfortably exceed 2^53
 * once we multiply by 1e8, so float math would silently lose precision on
 * larger invoices. BigInt division also gives us deterministic rounding.
 */
const RATE_SCALE = 100_000_000n; // 1e8

export function parseExchangeRateScaled(input: string): bigint | null {
  if (!input) return null;
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [intPart, fracPart = ""] = normalized.split(".");
  // Pad/truncate to 8 fractional digits.
  const frac8 = (fracPart + "00000000").slice(0, 8);
  const combined = `${intPart}${frac8}`.replace(/^0+(?=\d)/, "");
  let scaled: bigint;
  try {
    scaled = BigInt(combined || "0");
  } catch {
    return null;
  }
  return scaled > 0n ? scaled : null;
}

/**
 * Convert a total in foreign-currency cents to EUR cents using a scaled rate.
 *
 * Rate semantics: "1 EUR = X <FOREIGN>", i.e. 1 USD invoice at rate 1.08 means
 * 1 EUR buys 1.08 USD, so 100 USD cents → ⌊100 * 1e8 / 1.08e8⌋ ≈ 93 EUR cents.
 *
 * Rounding: standard floor toward zero. For invoices this matches the German
 * tax-office convention of always rounding net amounts to the nearest cent;
 * a single division at the document level (rather than per-position) keeps
 * the cumulative error to at most ±1 cent.
 */
export function toEurCents(
  totalCents: number,
  rateScaled: bigint,
): number {
  const totalBig = BigInt(totalCents);
  // bankers-style half-up rounding on the absolute value, then re-apply sign
  const negative = totalBig < 0n;
  const abs = negative ? -totalBig : totalBig;
  const numerator = abs * RATE_SCALE;
  const quotient = numerator / rateScaled;
  const remainder = numerator % rateScaled;
  const rounded =
    remainder * 2n >= rateScaled ? quotient + 1n : quotient;
  const signed = negative ? -rounded : rounded;
  // Result always fits safely in Number — invoices won't exceed 2^53 cents.
  return Number(signed);
}

/**
 * Compute eur_total_cent for an invoice or offer. Returns null for EUR (no
 * conversion needed) or for unparseable rates. Caller should treat null as
 * "store nothing in eur_total_cent" — DATEV export then falls back to total.
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
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(code);
  const value = isZeroDecimal ? cents / 100 : cents / 100;
  try {
    return value.toLocaleString("de-DE", {
      style: "currency",
      currency: code,
      minimumFractionDigits: isZeroDecimal ? 0 : 2,
      maximumFractionDigits: isZeroDecimal ? 0 : 2,
    });
  } catch {
    // Unknown ISO code — fall back to plain formatting.
    return `${value.toFixed(isZeroDecimal ? 0 : 2)} ${code}`;
  }
}
