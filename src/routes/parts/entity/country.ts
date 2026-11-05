export const ISO_COUNTRY_CODE_LENGTH = 2;

export const INVALID_COUNTRY_MESSAGE = "Land muss ein zweistelliger ISO-Code sein (z. B. DE, AT, CH).";

/** Upper-cased ISO 3166-1 alpha-2 code, or null when the input is not one. */
export function normalizeCountryCode(input: string | null | undefined): string | null {
  const code = input?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
