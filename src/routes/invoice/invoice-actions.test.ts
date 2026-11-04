import { describe, expect, it } from "vitest";
import type { Invoice } from "$lib/db/schema";
import {
  canCreateCreditNote,
  canDiscardInvoice,
  canRecordPayments,
  canReopenAsDraft,
  isOverdue,
  showsPayments,
} from "./invoice-actions";

type TestInvoice = Pick<Invoice, "status" | "isCreditNote" | "number" | "amountPaidCent" | "dueDate">;

function invoice(overrides: Partial<TestInvoice> = {}): TestInvoice {
  return {
    status: "sent",
    isCreditNote: false,
    number: "RE-2026-0001",
    amountPaidCent: 0,
    dueDate: 1_000,
    ...overrides,
  };
}

describe("canRecordPayments", () => {
  it("allows a first partial payment on a sent invoice", () => {
    expect(canRecordPayments(invoice({ status: "sent" }))).toBe(true);
  });

  it("allows further payments on a partial invoice", () => {
    expect(canRecordPayments(invoice({ status: "partial" }))).toBe(true);
  });

  it.each(["draft", "paid", "cancelled"] as const)("rejects %s invoices", (status) => {
    expect(canRecordPayments(invoice({ status }))).toBe(false);
  });

  it("rejects credit notes", () => {
    expect(canRecordPayments(invoice({ isCreditNote: true }))).toBe(false);
  });
});

describe("showsPayments", () => {
  it("shows the card on a sent invoice without payments", () => {
    expect(showsPayments(invoice({ status: "sent" }), 0)).toBe(true);
  });

  it("shows the card on a paid invoice only when payments exist", () => {
    expect(showsPayments(invoice({ status: "paid" }), 2)).toBe(true);
    expect(showsPayments(invoice({ status: "paid" }), 0)).toBe(false);
  });

  it("hides the card on drafts, cancelled invoices and credit notes", () => {
    expect(showsPayments(invoice({ status: "draft" }), 0)).toBe(false);
    expect(showsPayments(invoice({ status: "cancelled" }), 1)).toBe(false);
    expect(showsPayments(invoice({ isCreditNote: true, status: "paid" }), 1)).toBe(false);
  });
});

describe("canCreateCreditNote", () => {
  it.each(["sent", "partial", "paid"] as const)("allows %s invoices", (status) => {
    expect(canCreateCreditNote(invoice({ status }), false)).toBe(true);
  });

  it("rejects drafts, credit notes and already cancelled invoices", () => {
    expect(canCreateCreditNote(invoice({ status: "draft" }), false)).toBe(false);
    expect(canCreateCreditNote(invoice({ isCreditNote: true }), false)).toBe(false);
    expect(canCreateCreditNote(invoice(), true)).toBe(false);
  });
});

describe("isOverdue", () => {
  const now = 2_000;

  it("flags sent and partial invoices past their due date", () => {
    expect(isOverdue(invoice({ status: "sent" }), false, now)).toBe(true);
    expect(isOverdue(invoice({ status: "partial" }), false, now)).toBe(true);
  });

  it("does not flag invoices that are not due yet", () => {
    expect(isOverdue(invoice({ dueDate: now + 1 }), false, now)).toBe(false);
  });

  it("does not flag paid invoices, credit notes or invoices cancelled by a credit note", () => {
    expect(isOverdue(invoice({ status: "paid" }), false, now)).toBe(false);
    expect(isOverdue(invoice({ isCreditNote: true }), false, now)).toBe(false);
    expect(isOverdue(invoice(), true, now)).toBe(false);
  });
});

describe("canDiscardInvoice", () => {
  it("allows drafts that still carry the DRAFT placeholder", () => {
    expect(canDiscardInvoice({ status: "draft", number: "DRAFT-1a2b3c4d" })).toBe(true);
  });

  it("rejects numbered invoices in any status", () => {
    expect(canDiscardInvoice({ status: "draft", number: "RE-2026-0001" })).toBe(false);
    expect(canDiscardInvoice({ status: "sent", number: "RE-2026-0001" })).toBe(false);
    expect(canDiscardInvoice({ status: "cancelled", number: "RE-2026-0001" })).toBe(false);
  });
});

describe("canReopenAsDraft", () => {
  it("allows a sent invoice without payments", () => {
    expect(canReopenAsDraft(invoice(), 0, false)).toBe(true);
  });

  it("is hidden once payments were recorded", () => {
    expect(canReopenAsDraft(invoice(), 1, false)).toBe(false);
    expect(canReopenAsDraft(invoice({ amountPaidCent: 500 }), 0, false)).toBe(false);
  });

  it("is hidden for other statuses and for invoices cancelled by a credit note", () => {
    expect(canReopenAsDraft(invoice({ status: "partial" }), 0, false)).toBe(false);
    expect(canReopenAsDraft(invoice({ status: "paid" }), 0, false)).toBe(false);
    expect(canReopenAsDraft(invoice(), 0, true)).toBe(false);
  });
});
