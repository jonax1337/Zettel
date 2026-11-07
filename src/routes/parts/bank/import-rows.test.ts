import { describe, expect, it } from "vitest";
import { bankBookingKey, type Booking, type BookingMatch, type MatchCandidate } from "$lib/bank/match";
import type { InvoiceListRow } from "$lib/db/invoices";
import { fromIsoDate } from "$lib/utils/date";
import {
  bookingDateToUnix,
  canApply,
  paymentFor,
  toImportRows,
  type ImportRow,
} from "./import-rows";

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    valutaDate: "2026-03-05",
    amountCent: 11900,
    currency: "EUR",
    partyName: "Kunde",
    purpose: "RE-2026-0001",
    transactionId: "t1",
    ...overrides,
  };
}

function candidate(confidence: MatchCandidate["confidence"], invoiceId = 1): MatchCandidate {
  return { invoice: { id: invoiceId } as InvoiceListRow, confidence, reason: "" };
}

function match(
  bookingOverrides: Partial<Booking>,
  candidates: MatchCandidate[],
  defaultPick: number | null = candidates.length ? 0 : null,
): BookingMatch {
  return { booking: booking(bookingOverrides), candidates, defaultPick };
}

describe("toImportRows", () => {
  it("ticks only bookings whose preselected candidate is a high-confidence match", () => {
    const rows = toImportRows([
      match({}, [candidate("high")]),
      match({}, [candidate("medium")]),
      match({}, [candidate("low")]),
      match({}, []),
    ]);
    expect(rows.map((r) => r.included)).toEqual([true, false, false, false]);
  });

  it("never ticks outgoing money", () => {
    const [row] = toImportRows([match({ amountCent: -5000 }, [candidate("high")])]);
    expect(row.included).toBe(false);
  });

  it("starts with the preselected candidate", () => {
    const [row] = toImportRows([match({}, [candidate("low"), candidate("high", 2)], 1)]);
    expect(row.pickedCandidate).toBe(1);
    expect(row.included).toBe(true);
  });
});

describe("canApply", () => {
  it("needs incoming money and a candidate", () => {
    const [applicable, noCandidate, outgoing] = toImportRows([
      match({}, [candidate("high")]),
      match({}, []),
      match({ amountCent: -1 }, [candidate("high")]),
    ]);
    expect(canApply(applicable)).toBe(true);
    expect(canApply(noCandidate)).toBe(false);
    expect(canApply(outgoing)).toBe(false);
  });
});

describe("paymentFor", () => {
  const now = fromIsoDate("2026-04-01");
  const ticked = (): ImportRow => toImportRows([match({}, [candidate("high", 42)])])[0];

  it("builds the payment from the booking and the chosen invoice", () => {
    expect(paymentFor(ticked(), "camt", now)).toEqual({
      invoiceId: 42,
      paidAt: fromIsoDate("2026-03-05"),
      amountCent: 11900,
      source: "camt053",
      notes: "RE-2026-0001",
      bankTransactionId: bankBookingKey(booking()),
    });
  });

  it("gives a re-imported booking the same dedupe key, so it is not booked twice", () => {
    const again = toImportRows([match({}, [candidate("high", 42)])])[0];
    expect(paymentFor(again, "camt", now)?.bankTransactionId).toBe(
      paymentFor(ticked(), "camt", now)?.bankTransactionId,
    );
  });

  it("marks MT940 statements as such", () => {
    expect(paymentFor(ticked(), "mt940", now)?.source).toBe("mt940");
  });

  it("returns null for rows that are not ticked or have no chosen invoice", () => {
    const unticked = { ...ticked(), included: false };
    const unpicked = { ...ticked(), pickedCandidate: null };
    expect(paymentFor(unticked, "camt", now)).toBeNull();
    expect(paymentFor(unpicked, "camt", now)).toBeNull();
  });

  it("leaves the note empty for a booking without purpose", () => {
    const [row] = toImportRows([match({ purpose: "" }, [candidate("high")])]);
    expect(paymentFor(row, "camt", now)?.notes).toBeNull();
  });
});

describe("bookingDateToUnix", () => {
  it("uses the booking date, or the fallback when there is none", () => {
    expect(bookingDateToUnix("2026-03-05", 1)).toBe(fromIsoDate("2026-03-05"));
    expect(bookingDateToUnix("", 1234)).toBe(1234);
  });
});
