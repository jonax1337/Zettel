import type { Offer } from "$lib/db/schema";
import { arrangePlan, type PlannedAction } from "../invoice/detail/action-plan";

type ActionOffer = Pick<Offer, "status" | "convertedInvoiceId">;

/**
 * Whether the editor keeps the line totals an offer draft was saved with. The editor
 * only opens drafts, and reopening a sent offer clears its dates but not its PDF, so a
 * stored PDF is what shows that the customer may have seen these amounts.
 */
export function offerKeepsStoredAmounts(offer: Pick<Offer, "pdfPath">): boolean {
  return offer.pdfPath !== null;
}

/** An accepted offer can only go back to draft while no invoice was created from it. */
export function canReopenOffer(offer: ActionOffer): boolean {
  if (offer.status === "accepted") return !offer.convertedInvoiceId;
  return offer.status === "sent" || offer.status === "rejected" || offer.status === "expired";
}

export type OfferActionId =
  | "mark-sent"
  | "accept"
  | "reject"
  | "convert"
  | "open-pdf"
  | "generate-pdf"
  | "send-mail"
  | "edit"
  | "preview-pdf"
  | "regenerate-pdf"
  | "reopen-draft"
  | "delete";

export type OfferActionState = {
  status: Offer["status"];
  convertedInvoiceId: number | null;
  hasPdf: boolean;
};

/** An accepted offer waits for its invoice until one is created from it. */
export function awaitsConversion(offer: ActionOffer): boolean {
  return offer.status === "accepted" && !offer.convertedInvoiceId;
}

/** The step that moves the offer on: send it, decide it, convert it. */
function mainOfferAction(state: OfferActionState): OfferActionId | null {
  if (state.status === "draft") return "mark-sent";
  if (state.status === "sent") return "accept";
  if (awaitsConversion(state)) return "convert";
  return null;
}

/** Sorts the offer's actions into main button, secondary buttons and the more menu. */
export function planOfferActions(state: OfferActionState): PlannedAction<OfferActionId>[] {
  const isDraft = state.status === "draft";
  const header: OfferActionId[] = [state.hasPdf ? "open-pdf" : "generate-pdf"];
  if (isDraft) header.push("edit");
  header.push("send-mail");
  if (state.status === "sent") header.push("reject");

  // The header of a draft is full; a sent offer's PDF is the document, so only drafts are previewed.
  const menu: OfferActionId[] = [];
  if (isDraft) menu.push("preview-pdf");
  if (state.hasPdf) menu.push("regenerate-pdf");
  if (canReopenOffer(state)) menu.push("reopen-draft");
  if (isDraft || state.status === "rejected" || state.status === "expired") menu.push("delete");

  return arrangePlan(header, mainOfferAction(state), menu);
}
