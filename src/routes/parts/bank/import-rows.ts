import { bankBookingKey, type BookingMatch, type MatchCandidate } from "$lib/bank/match";
import type { AddPaymentInput } from "$lib/db/invoice-payments";
import { fromIsoDate } from "$lib/utils/date";

export type StatementFormat = "camt" | "mt940";

/** One booking of the statement together with the user's decision about it. */
export type ImportRow = {
  match: BookingMatch;
  pickedCandidate: number | null;
  included: boolean;
};

export function toImportRows(matches: BookingMatch[]): ImportRow[] {
  return matches.map((match) => {
    const pickedCandidate = match.defaultPick;
    const picked = pickedCandidate === null ? undefined : match.candidates[pickedCandidate];
    return {
      match,
      pickedCandidate,
      included: match.booking.amountCent > 0 && picked?.confidence === "high",
    };
  });
}

export function pickedMatch(row: ImportRow): MatchCandidate | null {
  return row.pickedCandidate === null ? null : (row.match.candidates[row.pickedCandidate] ?? null);
}

/** Bookings the user can choose to apply: incoming money with at least one invoice candidate. */
export function canApply(row: ImportRow): boolean {
  return row.match.booking.amountCent > 0 && row.match.candidates.length > 0;
}

export function bookingDateToUnix(isoDate: string, fallbackUnix: number): number {
  return isoDate ? fromIsoDate(isoDate) : fallbackUnix;
}

/**
 * The payment to record for a row, or null when the row is not ticked or has no
 * chosen invoice. It carries the booking's dedupe key, so `addPayment` rejects a
 * booking that an earlier import already recorded with `DuplicateBankBookingError`.
 */
export function paymentFor(
  row: ImportRow,
  format: StatementFormat,
  nowUnix: number,
): AddPaymentInput | null {
  const candidate = pickedMatch(row);
  if (!row.included || !candidate) return null;
  const { booking } = row.match;
  return {
    invoiceId: candidate.invoice.id,
    paidAt: bookingDateToUnix(booking.valutaDate, nowUnix),
    amountCent: booking.amountCent,
    source: format === "mt940" ? "mt940" : "camt053",
    notes: booking.purpose || null,
    bankTransactionId: bankBookingKey(booking),
  };
}
