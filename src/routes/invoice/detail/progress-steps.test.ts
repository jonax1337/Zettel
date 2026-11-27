import { describe, expect, it } from "vitest";
import { formatStepDate, offerProgressSteps, progressSteps, type OfferProgressInput, type ProgressInput } from "./progress-steps";

const ISSUED = new Date(2026, 9, 20, 12).getTime() / 1000;
const SENT = new Date(2026, 9, 21, 12).getTime() / 1000;
const PAID = new Date(2026, 10, 12, 12).getTime() / 1000;

function input(overrides: Partial<ProgressInput> = {}): ProgressInput {
  return {
    status: "sent",
    isCreditNote: false,
    issueDate: ISSUED,
    sentAt: SENT,
    paidAt: null,
    lastPaymentAt: null,
    reversedAt: null,
    ...overrides,
  };
}

function summary(steps: ReturnType<typeof progressSteps>) {
  return steps.map((s) => `${s.label}:${s.state}${s.date ? `@${s.date}` : ""}`);
}

describe("formatStepDate", () => {
  it("shows day and month", () => {
    expect(formatStepDate(ISSUED)).toBe("20.10.");
  });
});

describe("progressSteps", () => {
  it("starts a draft at the first step without dates", () => {
    expect(summary(progressSteps(input({ status: "draft", sentAt: null })))).toEqual([
      "Entwurf:now",
      "Ausgestellt:todo",
      "Versendet:todo",
      "Bezahlt:todo",
    ]);
  });

  it("rests an open invoice on the sent step", () => {
    expect(summary(progressSteps(input()))).toEqual([
      "Entwurf:done",
      "Ausgestellt:done@20.10.",
      "Versendet:now@21.10.",
      "Bezahlt:todo",
    ]);
  });

  it("tolerates a missing sent date", () => {
    expect(summary(progressSteps(input({ sentAt: null })))[2]).toBe("Versendet:now");
  });

  it("shows a partly paid invoice with the date of its newest payment", () => {
    expect(summary(progressSteps(input({ status: "partial", lastPaymentAt: PAID })))).toEqual([
      "Entwurf:done",
      "Ausgestellt:done@20.10.",
      "Versendet:done@21.10.",
      "Teilbezahlt:now@12.11.",
    ]);
  });

  it("completes a paid invoice", () => {
    expect(summary(progressSteps(input({ status: "paid", paidAt: PAID })))).toEqual([
      "Entwurf:done",
      "Ausgestellt:done@20.10.",
      "Versendet:done@21.10.",
      "Bezahlt:now@12.11.",
    ]);
  });

  it("replaces payment by the reversal on an invoice a credit note cancelled in full", () => {
    expect(summary(progressSteps(input({ reversedAt: PAID })))).toEqual([
      "Entwurf:done",
      "Ausgestellt:done@20.10.",
      "Versendet:done@21.10.",
      "Storniert:now@12.11.",
    ]);
  });

  it("ends a discarded draft with the cancellation", () => {
    expect(summary(progressSteps(input({ status: "cancelled", sentAt: null })))).toEqual([
      "Entwurf:done",
      "Storniert:now",
    ]);
  });

  it("gives a draft credit note no payment step", () => {
    expect(summary(progressSteps(input({ status: "draft", isCreditNote: true, sentAt: null })))).toEqual([
      "Entwurf:now",
      "Ausgestellt:todo",
      "Versendet:todo",
    ]);
  });

  it("ends an issued credit note on the sent step", () => {
    expect(summary(progressSteps(input({ isCreditNote: true })))).toEqual([
      "Entwurf:done",
      "Ausgestellt:done@20.10.",
      "Versendet:now@21.10.",
    ]);
  });
});

describe("offerProgressSteps", () => {
  const offer = (overrides: Partial<OfferProgressInput> = {}): OfferProgressInput => ({
    status: "sent",
    sentAt: SENT,
    acceptedAt: null,
    rejectedAt: null,
    validUntil: PAID,
    converted: false,
    ...overrides,
  });

  it("starts a draft at the first step", () => {
    expect(summary(offerProgressSteps(offer({ status: "draft", sentAt: null })))).toEqual([
      "Entwurf:now",
      "Versendet:todo",
      "Angenommen:todo",
    ]);
  });

  it("waits for the customer after sending", () => {
    expect(summary(offerProgressSteps(offer()))).toEqual(["Entwurf:done", "Versendet:now@21.10.", "Angenommen:todo"]);
  });

  it("goes on to the invoice once accepted", () => {
    expect(summary(offerProgressSteps(offer({ status: "accepted", acceptedAt: PAID })))).toEqual([
      "Entwurf:done",
      "Versendet:done@21.10.",
      "Angenommen:now@12.11.",
      "Rechnung:todo",
    ]);
  });

  it("ends on the invoice when the offer was converted", () => {
    const steps = offerProgressSteps(offer({ status: "accepted", acceptedAt: PAID, converted: true }));
    expect(summary(steps).slice(2)).toEqual(["Angenommen:done@12.11.", "Rechnung:now"]);
  });

  it("ends on the rejection", () => {
    expect(summary(offerProgressSteps(offer({ status: "rejected", rejectedAt: PAID })))).toEqual([
      "Entwurf:done",
      "Versendet:done@21.10.",
      "Abgelehnt:now@12.11.",
    ]);
  });

  it("ends on the day the offer lapsed", () => {
    expect(summary(offerProgressSteps(offer({ status: "expired" }))).at(-1)).toBe("Abgelaufen:now@12.11.");
  });
});
