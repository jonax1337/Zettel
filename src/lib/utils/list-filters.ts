export type FilterValues = Record<string, string | boolean>;

const STORAGE_PREFIX = "zettel.filters.";

type FilterStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): FilterStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Stored filters merged over the defaults; keys or types that no longer match a default are dropped. */
export function loadFilters<T extends FilterValues>(
  scope: string,
  defaults: T,
  storage: FilterStorage | null = defaultStorage(),
): T {
  try {
    const raw = storage?.getItem(STORAGE_PREFIX + scope);
    if (!raw) return { ...defaults };
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null) return { ...defaults };
    const merged: FilterValues = { ...defaults };
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = (stored as FilterValues)[key];
      if (typeof value === typeof fallback) merged[key] = value;
    }
    return merged as T;
  } catch {
    return { ...defaults };
  }
}

export function saveFilters(
  scope: string,
  values: FilterValues,
  storage: FilterStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(STORAGE_PREFIX + scope, JSON.stringify(values));
  } catch {
    // Blocked storage: filters simply reset on the next visit.
  }
}
