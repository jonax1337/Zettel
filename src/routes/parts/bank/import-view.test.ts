import { describe, expect, it } from "vitest";
import type { InvoiceListRow } from "$lib/db/invoices";
import type { MatchCandidate } from "$lib/bank/match";
import type { ImportRow } from "./import-rows";
import {
  MANUAL_REASON,
  assignManualInvoice,
  candidateLabel,
  classifyPaymentResult,
  formatBookingDate,
  invoicePickerLabel,
  manualCandidate,
  payableInvoices,
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

describe("classifyPaymentResult", () => {
  it("books a plain payment id", () => {
    expect(classifyPaymentResult(42)).toBe("applied");
    expect(classifyPaymentResult(undefined)).toBe("applied");
  });

  it("reports a result that flags itself as duplicate or skipped as a duplicate", () => {
    expect(classifyPaymentResult({ duplicate: true })).toBe("duplicate");
    expect(classifyPaymentResult({ skipped: true, id: null })).toBe("duplicate");
    expect(classifyPaymentResult({ id: 3 })).toBe("applied");
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
