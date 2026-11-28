import type { InvoiceStatus, OfferStatus } from "$lib/db/schema";

export type StepState = "done" | "now" | "todo";
export type ProgressStep = { label: string; date: string | null; state: StepState };

export type ProgressInput = {
  status: InvoiceStatus;
  isCreditNote: boolean;
  issueDate: number;
  sentAt: number | null;
  paidAt: number | null;
  /** Date of the newest payment, shown while the invoice is only partly paid. */
  lastPaymentAt: number | null;
  /** Issue date of the credit note that reverses the whole invoice, if there is one. */
  reversedAt: number | null;
};

/** "20.10." — the year is on the sheet. */
export function formatStepDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function step(label: string, state: StepState, timestamp: number | null = null): ProgressStep {
  return { label, state, date: timestamp === null ? null : formatStepDate(timestamp) };
}

/** The last step of a regular invoice: payment, or the credit note that reversed it instead. */
function closingStep(input: ProgressInput): ProgressStep {
  if (input.reversedAt !== null) return step("Storniert", "now", input.reversedAt);
  if (input.status === "paid") return step("Bezahlt", "now", input.paidAt);
  if (input.status === "partial") return step("Teilbezahlt", "now", input.lastPaymentAt);
  return step("Bezahlt", "todo");
}

/**
 * Where the invoice stands: draft, issued, sent, paid. Issuing and sending are one
 * step in the data (marking it sent numbers it), so both carry their own date.
 * A discarded draft and a credit note get the shorter lines that fit them.
 */
export function progressSteps(input: ProgressInput): ProgressStep[] {
  if (input.status === "cancelled") return [step("Entwurf", "done"), step("Storniert", "now")];
  if (input.status === "draft") {
    const upcoming = input.isCreditNote ? ["Ausgestellt", "Versendet"] : ["Ausgestellt", "Versendet", "Bezahlt"];
    return [step("Entwurf", "now"), ...upcoming.map((label) => step(label, "todo"))];
  }
  const issued = [step("Entwurf", "done"), step("Ausgestellt", "done", input.issueDate)];
  if (input.isCreditNote) return [...issued, step("Versendet", "now", input.sentAt)];
  const closing = closingStep(input);
  const sentState = closing.state === "todo" ? "now" : "done";
  return [...issued, step("Versendet", sentState, input.sentAt), closing];
}

export type OfferProgressInput = {
  status: OfferStatus;
  sentAt: number | null;
  acceptedAt: number | null;
  rejectedAt: number | null;
  validUntil: number;
  converted: boolean;
};

/** Draft, sent, then how the customer decided; an accepted offer goes on to its invoice. */
export function offerProgressSteps(input: OfferProgressInput): ProgressStep[] {
  const { status } = input;
  if (status === "draft") {
    return [step("Entwurf", "now"), step("Versendet", "todo"), step("Angenommen", "todo")];
  }
  const sent = (state: StepState) => [step("Entwurf", "done"), step("Versendet", state, input.sentAt)];
  if (status === "sent") return [...sent("now"), step("Angenommen", "todo")];
  if (status === "rejected") return [...sent("done"), step("Abgelehnt", "now", input.rejectedAt)];
  if (status === "expired") return [...sent("done"), step("Abgelaufen", "now", input.validUntil)];
  return [
    ...sent("done"),
    step("Angenommen", input.converted ? "done" : "now", input.acceptedAt),
    step("Rechnung", input.converted ? "now" : "todo"),
  ];
}
