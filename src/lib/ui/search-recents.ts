import type { SearchHit } from "$lib/db/search";

export const MAX_RECENTS = 5;

/** Pre-scoping key; its entries cannot be attributed to a data context. */
export const LEGACY_RECENTS_KEY = "zettel.search.recents";

/** `context` identifies the open database (the active DB URL: sandbox or one tenant). */
export function recentsKey(context: string): string {
  return `zettel.search.recents:${context}`;
}

export function loadRecents(storage: Storage, context: string): SearchHit[] {
  try {
    storage.removeItem(LEGACY_RECENTS_KEY);
    const parsed = JSON.parse(storage.getItem(recentsKey(context)) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

export function saveRecents(storage: Storage, context: string, list: SearchHit[]): void {
  try {
    storage.setItem(recentsKey(context), JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {
    // Recents are a convenience; a blocked storage must not break navigation.
  }
}
