import { loadFilters, saveFilters, type FilterValues } from "$lib/utils/list-filters";

/**
 * Filter state of a list that survives opening a row and coming back. Bind the
 * fields directly (`bind:search={filters.search}`); call during component init.
 */
export function createListFilters<T extends FilterValues>(scope: string, defaults: T) {
  const filters = $state<T>(loadFilters(scope, defaults));

  $effect(() => {
    saveFilters(scope, { ...filters });
  });

  return filters;
}
