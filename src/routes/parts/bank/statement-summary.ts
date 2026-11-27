import { PAYMENT_ROUNDING_TOLERANCE_CENT } from "$lib/db/invoice-lifecycle";
import { formatMoney } from "$lib/utils/currency";
import { pluralize } from "../entity/format";
import { formatBookingDate } from "./import-view";

/** The file name without its folders, for either path separator. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** "5 Buchungen vom 02.11.2026 bis 26.11.2026"; the dates are the bookings' value dates. */
export function statementSummary(bookings: { valutaDate: string }[]): string {
  const count = `${bookings.length} ${pluralize(bookings.length, "Buchung", "Buchungen")}`;
  const dates = bookings.map((b) => b.valutaDate).filter(Boolean).sort();
  if (dates.length === 0) return count;
  const [first, last] = [dates[0], dates[dates.length - 1]];
  return first === last
    ? `${count} vom ${formatBookingDate(first)}`
    : `${count} vom ${formatBookingDate(first)} bis ${formatBookingDate(last)}`;
}

/** What a payment leaves open, or what it exceeds the open balance by; null when it settles it. */
export function remainderNote(amountCent: number, openCent: number, currency: string): string | null {
  const diff = openCent - amountCent;
  if (Math.abs(diff) <= PAYMENT_ROUNDING_TOLERANCE_CENT) return null;
  return diff > 0
    ? `Teilzahlung, ${formatMoney(diff, currency)} bleiben offen`
    : `${formatMoney(-diff, currency)} mehr als offen`;
}
