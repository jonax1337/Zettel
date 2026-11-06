import { describe, expect, it } from "vitest";
import type { Invoice } from "$lib/db/schema";
import {
  canCreateCreditNote,
  canDiscardInvoice,
  canExportXrechnung,
  canRecordPayments,
  canReopenAsDraft,
  creditNoteCoverage,
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

describe("canExportXrechnung", () => {
  it.each(["sent", "partial", "paid"] as const)("offers the export for an issued %s invoice", (status) => {
    expect(canExportXrechnung(invoice({ status }))).toBe(true);
  });

  it("is not offered for a draft", () => {
    expect(canExportXrechnung(invoice({ status: "draft", number: "DRAFT-1a2b3c4d" }))).toBe(false);
  });

  it("is not offered for a placeholder number, whatever the status", () => {
    expect(canExportXrechnung(invoice({ status: "sent", number: "DRAFT-1a2b3c4d" }))).toBe(false);
  });

  it("is not offered for a discarded draft", () => {
    expect(canExportXrechnung(invoice({ status: "cancelled" }))).toBe(false);
  });

  it("is offered for an issued credit note", () => {
    expect(canExportXrechnung(invoice({ status: "sent", isCreditNote: true }))).toBe(true);
  });
});

describe("canRecordPayments", () => {
  it("allows a first partial payment on a sent invoice", () => {
    expect(canRecordPayments(invoice({ status: "sent" }), false)).toBe(true);
  });

  it("allows further payments on a partial invoice", () => {
    expect(canRecordPayments(invoice({ status: "partial" }), false)).toBe(true);
  });

  it.each(["draft", "paid", "cancelled"] as const)("rejects %s invoices", (status) => {
    expect(canRecordPayments(invoice({ status }), false)).toBe(false);
  });

  it("rejects credit notes", () => {
    expect(canRecordPayments(invoice({ isCreditNote: true }), false)).toBe(false);
  });

  it("rejects invoices already reversed by a credit note", () => {
    expect(canRecordPayments(invoice({ status: "sent" }), true)).toBe(false);
    expect(canRecordPayments(invoice({ status: "partial" }), true)).toBe(false);
  });
});

describe("showsPayments", () => {
  it("shows the card on a sent invoice without payments", () => {
    expect(showsPayments(invoice({ status: "sent" }), 0, false)).toBe(true);
  });

  it("shows the card on a paid invoice only when payments exist", () => {
    expect(showsPayments(invoice({ status: "paid" }), 2, false)).toBe(true);
    expect(showsPayments(invoice({ status: "paid" }), 0, false)).toBe(false);
  });

  it("hides the card on drafts, cancelled invoices and credit notes", () => {
    expect(showsPayments(invoice({ status: "draft" }), 0, false)).toBe(false);
    expect(showsPayments(invoice({ status: "cancelled" }), 1, false)).toBe(false);
    expect(showsPayments(invoice({ isCreditNote: true, status: "paid" }), 1, false)).toBe(false);
  });
});

describe("showsPayments on reversed invoices", () => {
  it("hides the card when nothing was paid", () => {
    expect(showsPayments(invoice({ status: "sent" }), 0, true)).toBe(false);
  });

  it("keeps recorded payments visible", () => {
    expect(showsPayments(invoice({ status: "partial" }), 2, true)).toBe(true);
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

describe("creditNoteCoverage", () => {
  const total = { total: 11_900 };

  it("is full when issued credit notes reverse the whole total", () => {
    expect(creditNoteCoverage(total, 11_900)).toBe("full");
  });

  it("is partial when they reverse only part of it", () => {
    expect(creditNoteCoverage(total, 3_000)).toBe("partial");
    expect(creditNoteCoverage(total, 11_899)).toBe("partial");
  });

  it("is none while nothing is credited yet, e.g. the credit note is still a draft", () => {
    expect(creditNoteCoverage(total, 0)).toBe("none");
  });
});