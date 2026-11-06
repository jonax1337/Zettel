import type { CustomerSnapshot } from "$lib/db/schema";
import { isBlank } from "$lib/utils/company-completeness";
import { normalizeBuyerReference } from "./buyer-reference";

type LiveCustomer = { leitwegId: string | null; email: string | null };

/**
 * An issued invoice is frozen, but the customer can gain a Leitweg-ID or e-mail
 * address afterwards. The export reads the missing values from the live customer
 * without writing them back to the invoice.
 */
export function withLiveCustomerFallbacks(
  buyerReference: string | null,
  snapshot: CustomerSnapshot,
  live: LiveCustomer | null,
): { buyerReference: string | null; customer: CustomerSnapshot } {
  return {
    buyerReference: normalizeBuyerReference(buyerReference) ?? normalizeBuyerReference(live?.leitwegId),
    customer: isBlank(snapshot.email) ? { ...snapshot, email: live?.email || snapshot.email } : snapshot,
  };
}
