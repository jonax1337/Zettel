import { describe, expect, it } from "vitest";
import type { SearchHit, SearchHitKind, SearchResults } from "$lib/db/search";
import { groupSearchResults, hitsInDisplayOrder } from "./search-groups";

function hit(kind: SearchHitKind, id: number): SearchHit {
  return { kind, id, number: `${kind}-${id}`, primary: "", secondary: null, route: "/" };
}

function results(partial: Partial<SearchResults>): SearchResults {
  return {
    invoices: [],
    customers: [],
    vendors: [],
    expenses: [],
    offers: [],
    reminders: [],
    ...partial,
  };
}

describe("groupSearchResults", () => {
  it("omits empty groups and keeps the display order", () => {
    const groups = groupSearchResults(
      results({ customers: [hit("customer", 1)], invoices: [hit("invoice", 2)] }),
    );
    expect(groups.map((g) => g.label)).toEqual(["Rechnungen", "Kunden"]);
  });

  it("returns no groups for empty results", () => {
    expect(groupSearchResults(results({}))).toEqual([]);
  });
});

describe("hitsInDisplayOrder", () => {
  it("lists offers before customers, exactly as the groups are rendered", () => {
    const groups = groupSearchResults(
      results({
        invoices: [hit("invoice", 1)],
        customers: [hit("customer", 2)],
        offers: [hit("offer", 3)],
      }),
    );
    expect(hitsInDisplayOrder(groups).map((h) => h.kind)).toEqual([
      "invoice",
      "offer",
      "customer",
    ]);
  });
});
