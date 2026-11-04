import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ execute: vi.fn(), insert: vi.fn(), select: vi.fn() }));
vi.mock("$lib/db/client", () => db);

import type { InvoiceListRow } from "$lib/db/invoices";
import type { MatchCandidate } from "$lib/bank/match";
import type { ImportRow } from "./import-rows";
import {
  MANUAL_REASON,
  assignManualInvoice,
  candidateLabel,
  formatBookingDate,
  invoicePickerLabel,
  manualCandidate,
  payableInvoices,
  recordBooking,
  summarizeOutcomes,
  type ApplyOutcome,
} from "./import-view";

function invoice(overrides: Partial<InvoiceListRow>): InvoiceListRow {
  return {
    id: 1,
    number: "RE-2026-0001",
    customerName: "ACME GmbH",
    status: "sent",
    isCreditNote: false,
    currency: "EUR",
    total: 11_900,
    amountPaidCent: 0,
    ...overrides,
  } as InvoiceListRow;
}

describe("candidateLabel", () => {
  it("shows German confidence names instead of the raw enum", () => {
    expect(candidateLabel({ confidence: "high", reason: "" })).toBe("Sicher");
    expect(candidateLabel({ confidence: "medium", reason: "" })).toBe("Wahrscheinlich");
    expect(candidateLabel({ confidence: "low", reason: "" })).toBe("Unsicher");
  });

  it("marks hand-picked invoices as manual", () => {
    expect(candidateLabel(manualCandidate(invoice({})))).toBe("Manuell");
    expect(manualCandidate(invoice({})).reason).toBe(MANUAL_REASON);
  });
});

describe("formatBookingDate", () => {
  it("shows the ISO date of the statement the way the rest of the app formats dates", () => {
    expect(formatBookingDate("2026-03-25")).toBe("25.3.2026");
  });

  it("shows a dash when the booking has no date", () => {
    expect(formatBookingDate("")).toBe("—");
  });
});

describe("payableInvoices", () => {
  it("keeps only open, non-credit-note invoices in the booking currency with an open balance", () => {
    const open = invoice({ id: 1 });
    const partial = invoice({ id: 2, status: "partial", amountPaidCent: 5_000 });
    const all = [
      open,
      partial,
      invoice({ id: 3, status: "paid" }),
      invoice({ id: 4, status: "draft" }),
      invoice({ id: 5, isCreditNote: true }),
      invoice({ id: 6, currency: "USD" }),
      invoice({ id: 7, status: "sent", amountPaidCent: 11_900 }),
    ];
    expect(payableInvoices(all, "eur")).toEqual([open, partial]);
  });
});

describe("invoicePickerLabel", () => {
  it("names number, customer and the open balance in the invoice currency", () => {
    const label = invoicePickerLabel(invoice({ status: "partial", amountPaidCent: 4_000 }));
    expect(label).toContain("RE-2026-0001");
    expect(label).toContain("ACME GmbH");
    expect(label).toContain("79,00");
    expect(label).toContain("offen");
  });
});

describe("recordBooking", () => {
  const payment = { invoiceId: 7, paidAt: 1_750_000_000, amountCent: 4_000, bankTransactionId: "key-1" };
  const booked = { invoiceId: 7, invoiceNumber: "RE-2026-0007", amountCent: 4_000, currency: "EUR" };

  function partiallyPaidInvoice(opts: { bookingRecorded: boolean }) {
    db.select.mockImplementation(async (sql: string) => {
      if (sql.includes("bank_transaction_id = ?")) return opts.bookingRecorded ? [{ id: 1 }] : [];
      if (sql.includes("MAX(paid_at)")) return [{ paid_cent: 9_000, last_paid_at: 1_750_000_000 }];
      return [{ status: "partial", total: 11_900, paid_cent: 5_000 }];
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.insert.mockResolvedValue(55);
    db.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  it("reports a recorded booking as applied", async () => {
    partiallyPaidInvoice({ bookingRecorded: false });

    expect(await recordBooking(payment, booked)).toEqual({ kind: "applied", ...booked });
  });

  it("skips a booking an earlier import of the same statement already recorded", async () => {
    partiallyPaidInvoice({ bookingRecorded: true });

    expect(await recordBooking(payment, booked)).toEqual({ kind: "duplicate", ...booked });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("reports any other refusal as failed, with the reason", async () => {
    db.select.mockResolvedValue([{ status: "paid", total: 11_900, paid_cent: 11_900 }]);

    const outcome = await recordBooking(payment, booked);

    expect(outcome.kind).toBe("failed");
    expect(outcome.kind === "failed" && outcome.message).toContain("versendete oder teilbezahlte");
  });
});

describe("summarizeOutcomes", () => {
  const applied: ApplyOutcome = {
    kind: "applied",
    invoiceId: 1,
    invoiceNumber: "RE-1",
    amountCent: 100,
    currency: "EUR",
  };
  const duplicate: ApplyOutcome = { ...applied, kind: "duplicate" };
  const failed: ApplyOutcome = {
    kind: "failed",
    invoiceNumber: "RE-2",
    amountCent: 100,
    currency: "EUR",
    message: "x",
  };

  it("names only the categories that occurred", () => {
    expect(summarizeOutcomes([applied])).toBe("1 Zahlung gebucht");
    expect(summarizeOutcomes([applied, applied, duplicate, failed])).toBe(
      "2 Zahlungen gebucht, 1 als Duplikat übersprungen, 1 fehlgeschlagen",
    );
  });
});

describe("assignManualInvoice", () => {
  function row(candidates: MatchCandidate[]): ImportRow {
    return {
      match: { booking: {} as ImportRow["match"]["booking"], candidates, defaultPick: null },
      pickedCandidate: null,
      included: false,
    };
  }

  it("adds the invoice as the picked candidate and ticks the row", () => {
    const target = row([]);
    assignManualInvoice(target, invoice({ id: 9 }));
    expect(target.match.candidates).toHaveLength(1);
    expect(target.match.candidates[0].invoice.id).toBe(9);
    expect(target.pickedCandidate).toBe(0);
    expect(target.included).toBe(true);
  });

  it("keeps automatic candidates and replaces an earlier manual pick", () => {
    const automatic: MatchCandidate = { invoice: invoice({ id: 1 }), confidence: "low", reason: "Name" };
    const target = row([automatic]);
    assignManualInvoice(target, invoice({ id: 2 }));
    assignManualInvoice(target, invoice({ id: 3 }));
    expect(target.match.candidates.map((c) => c.invoice.id)).toEqual([1, 3]);
    expect(target.pickedCandidate).toBe(1);
  });
});
