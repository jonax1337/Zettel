import type { InvoiceStatus } from "$lib/db/schema";

const PLACEHOLDER = /\{(YYYY|YY|MM|N{1,4})\}/g;

/**
 * Format an invoice number from a pattern like "RE-{YYYY}-{NNNN}".
 * Supported placeholders: {YYYY}, {YY}, {MM}, {NNNN}, {NNN}, {NN}, {N}.
 */
export function formatInvoiceNumber(
  pattern: string,
  counter: number,
  date: Date = new Date(),
): string {
  const yyyy = String(date.getFullYear());
  return pattern.replace(PLACEHOLDER, (_, token: string) => {
    if (token === "YYYY") return yyyy;
    if (token === "YY") return yyyy.slice(2);
    if (token === "MM") return String(date.getMonth() + 1).padStart(2, "0");
    return String(counter).padStart(token.length, "0");
  });
}

const DRAFT_PREFIX = "DRAFT-";
const DRAFT_DISPLAY_LENGTH = 4;
const DRAFT_RANDOM_LENGTH = 16;

/**
 * Random placeholder satisfies the UNIQUE constraint without burning a real
 * counter slot. The real number is assigned when the invoice is issued. The
 * "DRAFT-" prefix never collides with RE-/AN-/MA-.
 */
export function draftPlaceholder(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, DRAFT_RANDOM_LENGTH)
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${DRAFT_PREFIX}${random}`;
}

export function isDraftNumber(n: string | null | undefined): boolean {
  return !!n && n.startsWith(DRAFT_PREFIX);
}

export function displayInvoiceNumber(inv: {
  number: string;
  status: InvoiceStatus;
}): string {
  if (inv.status === "draft" && isDraftNumber(inv.number)) {
    const shortId = inv.number.slice(
      DRAFT_PREFIX.length,
      DRAFT_PREFIX.length + DRAFT_DISPLAY_LENGTH,
    );
    return `Entwurf #${shortId}`;
  }
  return inv.number;
}
