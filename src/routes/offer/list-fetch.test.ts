import { describe, expect, it, vi } from "vitest";
import type { OfferFilter } from "$lib/db/offers";
import { createOfferListFetcher } from "./list-fetch";

const filter = (search: string): OfferFilter => ({ search });

describe("createOfferListFetcher", () => {
  it("expires once and lists once on the first fetch", async () => {
    const expire = vi.fn().mockResolvedValue(0);
    const list = vi.fn().mockResolvedValue([]);
    const fetchOffers = createOfferListFetcher({ expire, list, onExpireError: vi.fn() });

    await fetchOffers(filter(""));

    expect(expire).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("makes a fetch started during the expiry wait for it", async () => {
    let finishExpiry!: () => void;
    const expire = vi.fn(() => new Promise<void>((resolve) => (finishExpiry = resolve)));
    const list = vi.fn().mockResolvedValue([]);
    const fetchOffers = createOfferListFetcher({ expire, list, onExpireError: vi.fn() });

    const first = fetchOffers(filter(""));
    const second = fetchOffers(filter("acme"));
    await Promise.resolve();
    expect(list).not.toHaveBeenCalled();

    finishExpiry();
    await Promise.all([first, second]);

    expect(expire).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("does not expire again on later fetches", async () => {
    const expire = vi.fn().mockResolvedValue(0);
    const fetchOffers = createOfferListFetcher({
      expire,
      list: vi.fn().mockResolvedValue([]),
      onExpireError: vi.fn(),
    });

    await fetchOffers(filter(""));
    await fetchOffers(filter("acme"));

    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("reports an expiry failure and still lists", async () => {
    const failure = new Error("db locked");
    const onExpireError = vi.fn();
    const list = vi.fn().mockResolvedValue([]);
    const fetchOffers = createOfferListFetcher({
      expire: vi.fn().mockRejectedValue(failure),
      list,
      onExpireError,
    });

    await fetchOffers(filter(""));

    expect(onExpireError).toHaveBeenCalledWith(failure);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
