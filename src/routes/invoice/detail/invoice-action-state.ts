import type { Invoice } from "$lib/db/schema";
import { creditedCentOf, isSettledByCreditNote, openBalanceCent } from "$lib/db/invoice-lifecycle";
import {
  canCreateCreditNote,
  canDiscardInvoice,
  canExportXrechnung,
  canRecordPayments,
  canReopenAsDraft,
  creditNoteCoverage,
  isOverdue,
  showsPayments,
} from "../invoice-actions";
import { isDraftNumber } from "$lib/utils/invoice-number";
import { isReminderLevel, nextReminderLevel } from "../reminder-levels";
import type { InvoiceActionState } from "./invoice-action-plan";

export type InvoiceStandingInput = {
  invoice: Invoice;
  paymentCount: number;
  /** The credit note written for this invoice, a draft one included. */
  creditNote: Invoice | null;
  reminderLevels: number[];
  hasPdf: boolean;
  /** The time entries of the credit note's original were freed again. */
  timeReleasedOnOriginal: boolean;
  releasableTimeCount: number;
  now: number;
};

/** Where an invoice stands: what its credit note took off, what is still due, and what the page may offer. */
export function deriveInvoiceStanding(input: InvoiceStandingInput) {
  const { invoice, creditNote, now } = input;
  const creditedCent = creditedCentOf(creditNote);
  const settledByCreditNote = isSettledByCreditNote({ ...invoice, creditedCent });
  const canRecordPayment = canRecordPayments(invoice, settledByCreditNote);
  const overdue = isOverdue(invoice, settledByCreditNote, now);
  const levels = input.reminderLevels.filter(isReminderLevel);
  const creatableReminderLevel = overdue && !levels.includes(3) ? nextReminderLevel(levels) : null;

  const actionState: InvoiceActionState = {
    status: invoice.status,
    isCreditNote: invoice.isCreditNote,
    isNumbered: !isDraftNumber(invoice.number),
    hasPdf: input.hasPdf,
    isOverdue: overdue,
    canRecordPayment,
    creatableReminderLevel,
    canExportXrechnung: canExportXrechnung(invoice),
    canCreateCreditNote: canCreateCreditNote(invoice, !!creditNote),
    canReopenDraft: canReopenAsDraft(invoice, input.paymentCount, !!creditNote, input.timeReleasedOnOriginal),
    canReleaseTime: input.releasableTimeCount > 0,
    canDiscard: canDiscardInvoice(invoice),
  };

  return {
    creditedCent,
    coverage: creditNoteCoverage(invoice, creditedCent),
    openCent: Math.max(0, openBalanceCent({ ...invoice, creditedCent })),
    settledByCreditNote,
    isOverdue: overdue,
    creatableReminderLevel,
    /** Marking it paid books a remainder: some of the invoice was paid or credited already. */
    settlesRemainder: invoice.status === "partial" || creditedCent > 0,
    paymentCardVisible: showsPayments(invoice, input.paymentCount, settledByCreditNote),
    actionState,
  };
}
