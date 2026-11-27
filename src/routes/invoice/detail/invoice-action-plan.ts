import type { InvoiceStatus, ReminderLevel } from "$lib/db/schema";
import { arrangePlan, type PlannedAction } from "./action-plan";

export type InvoiceActionId =
  | "issue"
  | "record-payment"
  | "create-reminder"
  | "open-pdf"
  | "generate-pdf"
  | "preview-pdf"
  | "send-mail"
  | "edit"
  | "mark-sent"
  | "mark-paid"
  | "regenerate-pdf"
  | "export-xrechnung"
  | "save-recurring"
  | "release-time"
  | "create-credit-note"
  | "reopen-draft"
  | "cancel"
  | "delete";

export type InvoiceActionState = {
  status: InvoiceStatus;
  isCreditNote: boolean;
  /** The invoice carries a real number; without one a draft is still a placeholder. */
  isNumbered: boolean;
  hasPdf: boolean;
  isOverdue: boolean;
  canRecordPayment: boolean;
  /** Level of the reminder that can be created next; null when none can. */
  creatableReminderLevel: ReminderLevel | null;
  canExportXrechnung: boolean;
  canCreateCreditNote: boolean;
  canReopenDraft: boolean;
  canReleaseTime: boolean;
  canDiscard: boolean;
};

export type InvoiceActionPlan = PlannedAction<InvoiceActionId>[];

/** The one action that moves the invoice on: issue a draft, chase an overdue one, or record a payment. */
function mainAction(state: InvoiceActionState): InvoiceActionId | null {
  if (state.status === "draft") return "issue";
  if (state.isOverdue && state.creatableReminderLevel) return "create-reminder";
  if (state.canRecordPayment) return "record-payment";
  return null;
}

/**
 * Decides which actions the header shows and which go into the more menu.
 * Conditions per action are today's, with one exception: a discarded draft is
 * offered the preview instead of PDF creation and mail, since a PDF of it would
 * carry a placeholder number. Otherwise this only sorts the actions into main
 * button, secondary buttons and menu.
 */
export function planInvoiceActions(state: InvoiceActionState): InvoiceActionPlan {
  const isDraft = state.status === "draft";
  // A discarded draft was never issued: a PDF of it would carry a placeholder number, so it only gets the preview.
  const isDiscardedDraft = state.status === "cancelled" && !state.isNumbered;
  const previewable = isDraft || isDiscardedDraft;
  const main = mainAction(state);
  // Mailing a paid or cancelled invoice is rare; an overdue one is chased with a reminder instead.
  const mailInHeader = main !== "create-reminder" && state.status !== "paid" && state.status !== "cancelled";

  const header: InvoiceActionId[] = [];
  if (state.hasPdf) header.push("open-pdf");
  else if (!previewable) header.push("generate-pdf");
  if (isDraft) header.push("edit");
  // A reopened draft has its old PDF button next to edit and mail; there the preview moves into the menu.
  if (previewable && !state.hasPdf) header.push("preview-pdf");
  if (mailInHeader) header.push("send-mail");
  if (main === "create-reminder") header.push("record-payment");

  const menu: InvoiceActionId[] = [];
  if (previewable && state.hasPdf) menu.push("preview-pdf");
  if (!mailInHeader && !isDiscardedDraft) menu.push("send-mail");
  if (isDraft) menu.push("mark-sent");
  if (state.canRecordPayment) menu.push("mark-paid");
  if (state.hasPdf && !isDraft) menu.push("regenerate-pdf");
  if (state.canExportXrechnung) menu.push("export-xrechnung");
  if (!state.isCreditNote) menu.push("save-recurring");
  if (state.canReleaseTime) menu.push("release-time");
  if (state.canCreateCreditNote) menu.push("create-credit-note");
  if (state.canReopenDraft) menu.push("reopen-draft");
  if (state.canDiscard) menu.push("cancel", "delete");

  return arrangePlan(header, main, menu);
}
