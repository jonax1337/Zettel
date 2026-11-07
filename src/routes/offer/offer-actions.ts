import type { Offer } from "$lib/db/schema";

type ActionOffer = Pick<Offer, "status" | "convertedInvoiceId">;

/** An accepted offer can only go back to draft while no invoice was created from it. */
export function canReopenOffer(offer: ActionOffer): boolean {
  if (offer.status === "accepted") return !offer.convertedInvoiceId;
  return offer.status === "sent" || offer.status === "rejected" || offer.status === "expired";
}
