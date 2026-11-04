import type { SearchHit, SearchHitKind, SearchResults } from "$lib/db/search";

export type SearchGroup = { key: SearchHitKind; label: string; hits: SearchHit[] };

const GROUP_ORDER: { key: SearchHitKind; label: string; field: keyof SearchResults }[] = [
  { key: "invoice", label: "Rechnungen", field: "invoices" },
  { key: "offer", label: "Angebote", field: "offers" },
  { key: "reminder", label: "Mahnungen", field: "reminders" },
  { key: "expense", label: "Ausgaben", field: "expenses" },
  { key: "customer", label: "Kunden", field: "customers" },
  { key: "vendor", label: "Lieferanten", field: "vendors" },
];

/** Non-empty result groups in the order they are displayed. */
export function groupSearchResults(results: SearchResults): SearchGroup[] {
  return GROUP_ORDER.filter(({ field }) => results[field].length > 0).map(
    ({ key, label, field }) => ({ key, label, hits: results[field] }),
  );
}

/** All hits in display order, so a keyboard index addresses the row shown at that position. */
export function hitsInDisplayOrder(groups: SearchGroup[]): SearchHit[] {
  return groups.flatMap((g) => g.hits);
}
