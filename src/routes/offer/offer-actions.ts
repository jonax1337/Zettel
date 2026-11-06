import type { Offer } from "$lib/db/schema";

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
