import type { OfferFilter, OfferListRow } from "$lib/db/offers";

type Deps = {
  expire: () => Promise<unknown>;
  list: (filter: OfferFilter) => Promise<OfferListRow[]>;
  onExpireError: (error: unknown) => void;
};

/**
 * Expires due offers once, then lists. Every fetch waits for that single expiry run, so a
 * filter change during it can never list rows from before the expiry.
 */
export function createOfferListFetcher({ expire, list, onExpireError }: Deps) {
  let expiry: Promise<void> | undefined;
  return async (filter: OfferFilter): Promise<OfferListRow[]> => {
    expiry ??= expire().then(() => undefined, onExpireError);
    await expiry;
    return list(filter);
  };
}
