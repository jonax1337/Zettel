import { describe, expect, it } from "vitest";
import type { InvoiceListRow } from "$lib/db/invoices";
import { matchBookings, openBalance, type Booking } from "./match";

function invoice(overrides: Partial<InvoiceListRow>): InvoiceListRow {
  return {
    id: 1,
    number: "RE-2026-0001",
    status: "sent",
    isCreditNote: false,
    total: 11_900,
    amountPaidCent: 0,
    customerName: "Muster GmbH",
    ...overrides,
  } as InvoiceListRow;
}

function booking(overrides: Partial<Booking>): Booking {
  return {
    valutaDate: "2026-05-17",
    amountCent: 11_900,
    currency: "EUR",
    partyName: "",
    purpose: "",
    transactionId: "tx-1",
    ...overrides,
  };
}

describe("matchBookings", () => {
  it("matches by invoice number in the purpose with high confidence", () => {
    const [match] = matchBookings(
      [booking({ purpose: "Zahlung zu re-2026-0001 danke", amountCent: 1 })],
      [invoice({})],
    );
    expect(match.candidates.map((c) => c.confidence)).toEqual(["high"]);
    expect(match.defaultPick).toBe(0);
  });

  it("does not match a longer number that merely contains the invoice number", () => {
    const [match] = matchBookings(
      [booking({ purpose: "RE-2026-00012", amountCent: 1 })],
      [invoice({ number: "RE-2026-0001" })],
    );
    expect(match.candidates).toEqual([]);
  });

  it("ignores draft placeholder numbers", () => {
    const [match] = matchBookings(
      [booking({ purpose: "DRAFT-abc", amountCent: 1 })],
      [invoice({ number: "DRAFT-abc" })],
    );
    expect(match.candidates).toEqual([]);
  });

  it("falls back to the open balance within one cent", () => {
    const [match] = matchBookings(
      [booking({ amountCent: 5_001 })],
      [invoice({ total: 10_000, amountPaidCent: 5_000 })],
    );
    expect(match.candidates.map((c) => c.confidence)).toEqual(["medium"]);
  });

  it("suggests a customer by name only as low confidence without a default pick", () => {
    const [match] = matchBookings(
      [booking({ amountCent: 1, partyName: "Muster Gmbh & Co KG" })],
      [invoice({})],
    );
    expect(match.candidates.map((c) => c.confidence)).toEqual(["low"]);
    expect(match.defaultPick).toBeNull();
  });

  it("skips outgoing payments entirely", () => {
    const [match] = matchBookings([booking({ amountCent: -11_900 })], [invoice({})]);
    expect(match).toMatchObject({ candidates: [], defaultPick: null });
  });

  it("only considers open, non-credit-note invoices", () => {
    const [match] = matchBookings(
      [booking({})],
      [invoice({ status: "paid" }), invoice({ id: 2, isCreditNote: true })],
    );
    expect(match.candidates).toEqual([]);
  });
});

describe("openBalance", () => {
  it("subtracts what was already paid from the absolute invoice total", () => {
    expect(openBalance({ total: 11_900, amountPaidCent: 4_000 })).toBe(7_900);
    expect(openBalance({ total: -11_900, amountPaidCent: 0 })).toBe(11_900);
  });
});
