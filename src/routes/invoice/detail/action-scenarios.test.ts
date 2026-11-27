import { describe, expect, it } from "vitest";
import type { Invoice, Offer } from "$lib/db/schema";
import { planOfferActions } from "../../offer/offer-actions";
import { actionsAt, buttonActions } from "./action-plan";
import { deriveInvoiceStanding } from "./invoice-action-state";
import { planInvoiceActions } from "./invoice-action-plan";

const DAY = 86_400;
const NOW = 1_795_000_000;
const NEVER_NUMBERED = "DRAFT-d349aaaabbbbcccc";

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    number: "RE-2026-0012",
    customerId: 1,
    customerSnapshot: "{}",
    issueDate: NOW - 10 * DAY,
    deliveryDate: null,
    dueDate: NOW + 4 * DAY,
    status: "sent",
    subtotal: 100_000,
    vatAmount: 19_000,
    total: 119_000,
    isKleinunternehmer: false,
    isReverseCharge: false,
    reverseChargeType: "none",
    supplyKind: "services",
    notes: null,
    paymentTerms: null,
    pdfPath: "C:/Zettel/Rechnungen/RE-2026-0012.pdf",
    isCreditNote: false,
    correctsInvoiceId: null,
    createdAt: NOW - 11 * DAY,
    updatedAt: NOW - 10 * DAY,
    sentAt: NOW - 10 * DAY,
    paidAt: null,
    lastValidationStatus: null,
    lastValidatedAt: null,
    lastValidationFindingsCount: null,
    currency: "EUR",
    exchangeRate: null,
    eurTotalCent: null,
    notesInternal: null,
    followUpDate: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    skontoPercent: null,
    skontoDays: null,
    amountPaidCent: 0,
    pdfLanguage: "de",
    buyerReference: null,
    ...overrides,
  };
}

type Scene = {
  paymentCount?: number;
  creditNote?: Invoice | null;
  reminderLevels?: number[];
  timeReleasedOnOriginal?: boolean;
  releasableTimeCount?: number;
};

function planFor(doc: Invoice, scene: Scene = {}) {
  const standing = deriveInvoiceStanding({
    invoice: doc,
    paymentCount: scene.paymentCount ?? 0,
    creditNote: scene.creditNote ?? null,
    reminderLevels: scene.reminderLevels ?? [],
    hasPdf: doc.pdfPath !== null,
    timeReleasedOnOriginal: scene.timeReleasedOnOriginal ?? false,
    releasableTimeCount: scene.releasableTimeCount ?? 0,
    now: NOW,
  });
  const plan = planInvoiceActions(standing.actionState);
  return {
    standing,
    main: actionsAt(plan, "main"),
    header: actionsAt(plan, "header"),
    buttons: buttonActions(plan),
    menu: actionsAt(plan, "menu"),
  };
}

const OVERDUE = { dueDate: NOW - 24 * DAY };

describe("invoice actions per state, from real invoices through the real predicates", () => {
  it("never-numbered draft: issue, edit and mail; issuing without PDF, template, discard in the menu", () => {
    const result = planFor(invoice({ status: "draft", number: NEVER_NUMBERED, pdfPath: null, sentAt: null }));
    expect(result.main).toEqual(["issue"]);
    expect(result.header).toEqual(["edit", "send-mail"]);
    expect(result.menu).toEqual(["mark-sent", "save-recurring", "cancel", "delete"]);
  });

  it("reopened draft with its number and PDF: open the PDF, no discarding because the number is taken", () => {
    const result = planFor(invoice({ status: "draft", sentAt: null }));
    expect(result.main).toEqual(["issue"]);
    expect(result.header).toEqual(["open-pdf", "edit", "send-mail"]);
    expect(result.menu).toEqual(["mark-sent", "save-recurring"]);
  });

  it("sent, not due yet: record the payment; paying, reversing and reopening in the menu", () => {
    const result = planFor(invoice());
    expect(result.standing.isOverdue).toBe(false);
    expect(result.main).toEqual(["record-payment"]);
    expect(result.header).toEqual(["open-pdf", "send-mail"]);
    expect(result.menu).toEqual([
      "mark-paid",
      "regenerate-pdf",
      "export-xrechnung",
      "save-recurring",
      "create-credit-note",
      "reopen-draft",
    ]);
  });

  it("sent without a stored PDF: creating it stays one click away", () => {
    const result = planFor(invoice({ pdfPath: null }));
    expect(result.header).toEqual(["generate-pdf", "send-mail"]);
    expect(result.menu).not.toContain("regenerate-pdf");
  });

  it("partially paid: still record the payment, no reopening once money was booked", () => {
    const result = planFor(invoice({ status: "partial", amountPaidCent: 40_000 }), { paymentCount: 1 });
    expect(result.main).toEqual(["record-payment"]);
    expect(result.standing.settlesRemainder).toBe(true);
    expect(result.header).toEqual(["open-pdf", "send-mail"]);
    expect(result.menu).toEqual(["mark-paid", "regenerate-pdf", "export-xrechnung", "save-recurring", "create-credit-note"]);
  });

  it("overdue with a free reminder level: create the first reminder, the payment moves next to it", () => {
    const result = planFor(invoice(OVERDUE));
    expect(result.standing.creatableReminderLevel).toBe(1);
    expect(result.main).toEqual(["create-reminder"]);
    expect(result.header).toEqual(["open-pdf", "record-payment"]);
    expect(result.menu[0]).toBe("send-mail");
  });

  it("overdue after the first reminder: the next level is the main action", () => {
    expect(planFor(invoice(OVERDUE), { reminderLevels: [1] }).standing.creatableReminderLevel).toBe(2);
  });

  it("overdue with all reminder levels used: back to recording the payment", () => {
    const result = planFor(invoice(OVERDUE), { reminderLevels: [1, 2, 3] });
    expect(result.standing.creatableReminderLevel).toBeNull();
    expect(result.main).toEqual(["record-payment"]);
    expect(result.header).toEqual(["open-pdf", "send-mail"]);
  });

  it("paid: nothing to move on, only the PDF in the header", () => {
    const result = planFor(invoice({ status: "paid", amountPaidCent: 119_000, paidAt: NOW - DAY }), { paymentCount: 1 });
    expect(result.main).toEqual([]);
    expect(result.header).toEqual(["open-pdf"]);
    expect(result.menu).toEqual(["send-mail", "regenerate-pdf", "export-xrechnung", "save-recurring", "create-credit-note"]);
  });

  it("cancelled draft, current behaviour: PDF creation and mail are still offered (another task changes this)", () => {
    const result = planFor(invoice({ status: "cancelled", number: NEVER_NUMBERED, pdfPath: null, sentAt: null }));
    expect(result.main).toEqual([]);
    expect(result.header).toEqual(["generate-pdf"]);
    expect(result.menu).toEqual(["send-mail", "save-recurring"]);
  });

  it("credit note draft: issue it, no recurring template", () => {
    const result = planFor(
      invoice({ status: "draft", isCreditNote: true, number: NEVER_NUMBERED, pdfPath: null, total: -119_000, correctsInvoiceId: 7 }),
    );
    expect(result.main).toEqual(["issue"]);
    expect(result.header).toEqual(["edit", "send-mail"]);
    expect(result.menu).toEqual(["mark-sent", "cancel", "delete"]);
  });

  it("issued credit note: no main action, no payments, no second credit note", () => {
    const result = planFor(invoice({ isCreditNote: true, total: -119_000, correctsInvoiceId: 7 }));
    expect(result.main).toEqual([]);
    expect(result.header).toEqual(["open-pdf", "send-mail"]);
    expect(result.menu).toEqual(["regenerate-pdf", "export-xrechnung", "reopen-draft"]);
  });

  it("original reversed in full by an issued credit note: settled, nothing to pay, no second credit note", () => {
    const creditNote = invoice({ id: 2, isCreditNote: true, total: -119_000, correctsInvoiceId: 1 });
    const result = planFor(invoice(OVERDUE), { creditNote });
    expect(result.standing.settledByCreditNote).toBe(true);
    expect(result.standing.coverage).toBe("full");
    expect(result.standing.isOverdue).toBe(false);
    expect(result.main).toEqual([]);
    expect(result.menu).not.toContain("mark-paid");
    expect(result.menu).not.toContain("create-credit-note");
    expect(result.menu).not.toContain("reopen-draft");
  });

  it("original with only a draft credit note: still due, the credit note blocks a second one", () => {
    const creditNote = invoice({ id: 2, status: "draft", isCreditNote: true, total: -119_000, correctsInvoiceId: 1 });
    const result = planFor(invoice(), { creditNote });
    expect(result.standing.coverage).toBe("none");
    expect(result.main).toEqual(["record-payment"]);
    expect(result.menu).not.toContain("create-credit-note");
  });

  it("original partly credited: the remainder is still collected", () => {
    const creditNote = invoice({ id: 2, isCreditNote: true, total: -50_000, correctsInvoiceId: 1 });
    const result = planFor(invoice(), { creditNote });
    expect(result.standing.coverage).toBe("partial");
    expect(result.standing.settlesRemainder).toBe(true);
    expect(result.main).toEqual(["record-payment"]);
  });

  it("releasable time entries add their menu entry", () => {
    expect(planFor(invoice(), { releasableTimeCount: 3 }).menu).toContain("release-time");
  });

  it("offers every action at most once, whatever the state", () => {
    const docs = [
      invoice({ status: "draft", number: NEVER_NUMBERED }),
      invoice(),
      invoice(OVERDUE),
      invoice({ status: "paid" }),
      invoice({ status: "cancelled", number: NEVER_NUMBERED }),
    ];
    for (const doc of docs) {
      const result = planFor(doc);
      const all = [...result.buttons, ...result.menu];
      expect(new Set(all).size).toBe(all.length);
      expect(result.main.length).toBeLessThanOrEqual(1);
    }
  });
});

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 1,
    number: "AN-2026-0001",
    customerId: 1,
    customerSnapshot: "{}",
    issueDate: NOW - 10 * DAY,
    validUntil: NOW + 20 * DAY,
    status: "draft",
    subtotal: 100_000,
    vatAmount: 19_000,
    total: 119_000,
    isKleinunternehmer: false,
    isReverseCharge: false,
    reverseChargeType: "none",
    supplyKind: "services",
    notes: null,
    introText: null,
    pdfPath: null,
    convertedInvoiceId: null,
    createdAt: NOW - 11 * DAY,
    updatedAt: NOW - 10 * DAY,
    sentAt: null,
    acceptedAt: null,
    rejectedAt: null,
    currency: "EUR",
    exchangeRate: null,
    servicePeriodStart: null,
    servicePeriodEnd: null,
    skontoPercent: null,
    skontoDays: null,
    pdfLanguage: "de",
    ...overrides,
  };
}

function offerPlan(doc: Offer) {
  const plan = planOfferActions({ status: doc.status, convertedInvoiceId: doc.convertedInvoiceId, hasPdf: doc.pdfPath !== null });
  return { main: actionsAt(plan, "main"), header: actionsAt(plan, "header"), menu: actionsAt(plan, "menu") };
}

describe("offer actions per state, from real offers", () => {
  it("draft without PDF: mark it sent; PDF, edit and mail around it; delete in the menu", () => {
    expect(offerPlan(offer())).toEqual({ main: ["mark-sent"], header: ["generate-pdf", "edit", "send-mail"], menu: ["delete"] });
  });

  it("draft with PDF: open it, regenerate in the menu", () => {
    expect(offerPlan(offer({ pdfPath: "C:/a.pdf" }))).toEqual({
      main: ["mark-sent"],
      header: ["open-pdf", "edit", "send-mail"],
      menu: ["regenerate-pdf", "delete"],
    });
  });

  it("sent: accept, with the rejection next to it; reopening in the menu", () => {
    expect(offerPlan(offer({ status: "sent", sentAt: NOW, pdfPath: "C:/a.pdf" }))).toEqual({
      main: ["accept"],
      header: ["open-pdf", "send-mail", "reject"],
      menu: ["regenerate-pdf", "reopen-draft"],
    });
  });

  it("accepted, not yet an invoice: convert it", () => {
    const result = offerPlan(offer({ status: "accepted", pdfPath: "C:/a.pdf" }));
    expect(result.main).toEqual(["convert"]);
    expect(result.menu).toEqual(["regenerate-pdf", "reopen-draft"]);
  });

  it("accepted and converted: nothing to move on, no reopening", () => {
    const result = offerPlan(offer({ status: "accepted", convertedInvoiceId: 9, pdfPath: "C:/a.pdf" }));
    expect(result.main).toEqual([]);
    expect(result.menu).toEqual(["regenerate-pdf"]);
  });

  it("declined: reopen or delete", () => {
    const result = offerPlan(offer({ status: "rejected", pdfPath: "C:/a.pdf" }));
    expect(result.main).toEqual([]);
    expect(result.menu).toEqual(["regenerate-pdf", "reopen-draft", "delete"]);
  });

  it("expired: reopen or delete", () => {
    const result = offerPlan(offer({ status: "expired", pdfPath: "C:/a.pdf" }));
    expect(result.main).toEqual([]);
    expect(result.menu).toEqual(["regenerate-pdf", "reopen-draft", "delete"]);
  });
});
