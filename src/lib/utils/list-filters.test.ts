import { describe, expect, it } from "vitest";
import { hasActiveFilters, loadFilters, saveFilters } from "./list-filters";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const defaults = { status: "all", year: "all", search: "", onlyOpen: false };

describe("list filters", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(loadFilters("invoices", defaults, memoryStorage())).toEqual(defaults);
  });

  it("restores what was saved", () => {
    const storage = memoryStorage();
    saveFilters("invoices", { ...defaults, status: "sent", search: "acme" }, storage);
    expect(loadFilters("invoices", defaults, storage)).toEqual({
      ...defaults,
      status: "sent",
      search: "acme",
    });
  });

  it("keeps lists apart", () => {
    const storage = memoryStorage();
    saveFilters("invoices", { ...defaults, status: "sent" }, storage);
    expect(loadFilters("offers", defaults, storage)).toEqual(defaults);
  });

  it("ignores stored keys and types that no longer fit the defaults", () => {
    const storage = memoryStorage({
      "zettel.filters.invoices": JSON.stringify({ status: 5, retired: "x", onlyOpen: true }),
    });
    expect(loadFilters("invoices", defaults, storage)).toEqual({ ...defaults, onlyOpen: true });
  });

  it("knows when a filter differs from its default", () => {
    expect(hasActiveFilters(defaults, defaults)).toBe(false);
    expect(hasActiveFilters({ ...defaults, status: "paid" }, defaults)).toBe(true);
    expect(hasActiveFilters({ ...defaults, year: "2025" }, defaults)).toBe(true);
    expect(hasActiveFilters({ ...defaults, onlyOpen: true }, defaults)).toBe(true);
  });

  it("falls back to the defaults on corrupt data or missing storage", () => {
    expect(
      loadFilters("invoices", defaults, memoryStorage({ "zettel.filters.invoices": "{oops" })),
    ).toEqual(defaults);
    expect(loadFilters("invoices", defaults, null)).toEqual(defaults);
    expect(() => saveFilters("invoices", defaults, null)).not.toThrow();
  });
});
