/**
 * Persistente Sortierung für Listen-Tabellen.
 * State pro Liste in localStorage; clientseitige Sortierung (Datenmengen
 * <1000 Rows sind realistisch).
 */

export type SortDirection = "asc" | "desc" | null;

export type SortState<K extends string> = {
  key: K | null;
  dir: SortDirection;
};

const STORAGE_PREFIX = "zettel.sort.";

export function loadSortState<K extends string>(
  scope: string,
  fallback: SortState<K> = { key: null, dir: null },
): SortState<K> {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + scope);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as SortState<K>;
    if (parsed && typeof parsed === "object" && "key" in parsed && "dir" in parsed) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveSortState<K extends string>(scope: string, state: SortState<K>): void {
  try {
    if (state.key === null || state.dir === null) {
      localStorage.removeItem(STORAGE_PREFIX + scope);
    } else {
      localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Anwenden einer Sortierung. `accessors[key]` liefert den Wert für die
 * jeweilige Spalte (Number/Date/String/null). Stabil — Reihenfolge bei
 * gleichwertigen Items bleibt erhalten.
 */
export function applySort<T, K extends string>(
  rows: T[],
  state: SortState<K>,
  accessors: Record<K, (row: T) => string | number | null | undefined>,
): T[] {
  if (state.key === null || state.dir === null) return rows;
  const key = state.key;
  const accessor = accessors[key];
  const sign = state.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * sign;
    }
    return String(av).localeCompare(String(bv), "de", { sensitivity: "base" }) * sign;
  });
}
