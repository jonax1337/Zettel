import { describe, expect, it } from "vitest";
import type { SearchHit } from "$lib/db/search";
import {
  LEGACY_RECENTS_KEY,
  MAX_RECENTS,
  loadRecents,
  recentsKey,
  saveRecents,
} from "./search-recents";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

function hit(id: number): SearchHit {
  return {
    kind: "invoice",
    id,
    number: `RE-${id}`,
    primary: `Kunde ${id}`,
    secondary: "",
    route: `/invoice/${id}`,
  } as SearchHit;
}

describe("search recents", () => {
  it("keeps data contexts apart", () => {
    const storage = memoryStorage();
    saveRecents(storage, "sqlite:zettel.db", [hit(1)]);
    saveRecents(storage, "sqlite:zettel-sandbox.db", [hit(2)]);
    expect(loadRecents(storage, "sqlite:zettel.db").map((h) => h.id)).toEqual([1]);
    expect(loadRecents(storage, "sqlite:zettel-sandbox.db").map((h) => h.id)).toEqual([2]);
    expect(loadRecents(storage, "sqlite:other.db")).toEqual([]);
  });

  it("returns an empty list for malformed or non-array JSON", () => {
    const storage = memoryStorage();
    storage.setItem(recentsKey("a"), "{not json");
    expect(loadRecents(storage, "a")).toEqual([]);
    storage.setItem(recentsKey("a"), '{"x":1}');
    expect(loadRecents(storage, "a")).toEqual([]);
  });

  it("caps the list at the maximum", () => {
    const storage = memoryStorage();
    const many = Array.from({ length: MAX_RECENTS + 3 }, (_, i) => hit(i));
    saveRecents(storage, "a", many);
    expect(loadRecents(storage, "a")).toHaveLength(MAX_RECENTS);
  });

  it("drops the legacy unscoped key without migrating it", () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_RECENTS_KEY, JSON.stringify([hit(9)]));
    expect(loadRecents(storage, "a")).toEqual([]);
    expect(storage.getItem(LEGACY_RECENTS_KEY)).toBeNull();
  });
});
