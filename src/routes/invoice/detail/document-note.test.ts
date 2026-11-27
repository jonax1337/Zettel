import { describe, expect, it } from "vitest";
import { formatDate } from "$lib/utils/date";
import { invoiceDateNote, invoiceTitle, offerDateNote } from "./document-note";

const ISSUED = new Date(2026, 9, 20, 12).getTime() / 1000;
const DUE = new Date(2026, 10, 3, 12).getTime() / 1000;
const PAID = new Date(2026, 10, 12, 12).getTime() / 1000;

function invoice(overrides: Partial<Parameters<typeof invoiceDateNote>[0]> = {}): Parameters<typeof invoiceDateNote>[0] {
  return { status: "sent", isCreditNote: false, number: "RE-2026-0013", issueDate: ISSUED, dueDate: DUE, paidAt: null, ...overrides };
}

describe("invoiceDateNote", () => {
  it("says a never-numbered draft has no number yet", () => {
    expect(invoiceDateNote(invoice({ status: "draft", number: "DRAFT-d349aaaabbbbcccc" }))).toBe("noch ohne Rechnungsnummer");
  });

  it("says a never-numbered credit note draft has no number yet", () => {
    expect(invoiceDateNote(invoice({ status: "draft", isCreditNote: true, number: "DRAFT-d349aaaabbbbcccc" }))).toBe("noch ohne Nummer");
  });

  it("does not call a reopened draft numberless: it keeps its number", () => {
    const note = invoiceDateNote(invoice({ status: "draft" }));
    expect(note).toContain("behält");
    expect(note).not.toContain("ohne");
  });

  it.each(["sent", "partial"] as const)("names the due date of a %s invoice", (status) => {
    expect(invoiceDateNote(invoice({ status }))).toBe(`fällig am ${formatDate(DUE)}`);
  });

  it("names the payment date of a paid invoice", () => {
    expect(invoiceDateNote(invoice({ status: "paid", paidAt: PAID }))).toBe(`bezahlt am ${formatDate(PAID)}`);
  });

  it("has nothing to say about a paid invoice without a stored payment date", () => {
    expect(invoiceDateNote(invoice({ status: "paid" }))).toBeNull();
  });

  it("names the date of an issued credit note instead of a due date", () => {
    expect(invoiceDateNote(invoice({ isCreditNote: true }))).toBe(`Stornodatum ${formatDate(ISSUED)}`);
  });

  it("has nothing to say about a discarded draft", () => {
    expect(invoiceDateNote(invoice({ status: "cancelled" }))).toBeNull();
  });
});

describe("invoiceTitle", () => {
  const title = (overrides: Partial<Parameters<typeof invoiceTitle>[0]> = {}) =>
    invoiceTitle({ status: "sent", isCreditNote: false, number: "RE-2026-0013", ...overrides });

  it("is the number of an issued invoice", () => {
    expect(title()).toBe("RE-2026-0013");
  });

  it("calls a draft without a number just a draft", () => {
    expect(title({ status: "draft", number: "DRAFT-d349aaaabbbbcccc" })).toBe("Rechnungsentwurf");
  });

  it("keeps the number of a reopened draft visible", () => {
    expect(title({ status: "draft" })).toBe("RE-2026-0013");
  });

  it("marks a credit note, drafts included", () => {
    expect(title({ isCreditNote: true })).toBe("Storno RE-2026-0013");
    expect(title({ isCreditNote: true, status: "draft", number: "DRAFT-d349aaaabbbbcccc" })).toBe(
      "Storno Entwurf #d349",
    );
  });
});

describe("offerDateNote", () => {
  const note = (overrides: Partial<Parameters<typeof offerDateNote>[0]> = {}) =>
    offerDateNote({ status: "sent", validUntil: DUE, acceptedAt: null, rejectedAt: null, ...overrides });

  it("has nothing to say about a draft", () => {
    expect(note({ status: "draft" })).toBeNull();
  });

  it("names how long a sent offer is valid", () => {
    expect(note()).toBe(`gültig bis ${formatDate(DUE)}`);
  });

  it("names the day it was accepted or rejected", () => {
    expect(note({ status: "accepted", acceptedAt: PAID })).toBe(`angenommen am ${formatDate(PAID)}`);
    expect(note({ status: "rejected", rejectedAt: PAID })).toBe(`abgelehnt am ${formatDate(PAID)}`);
  });

  it("tolerates a missing decision date", () => {
    expect(note({ status: "accepted" })).toBeNull();
    expect(note({ status: "rejected" })).toBeNull();
  });

  it("names the day the offer lapsed", () => {
    expect(note({ status: "expired" })).toBe(`abgelaufen am ${formatDate(DUE)}`);
  });
});
