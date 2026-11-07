import {
  hasActiveFilters,
  loadFilters,
  saveFilters,
  type FilterValues,
} from "$lib/utils/list-filters";

/**
 * Filter state of a list that survives opening a row and coming back. Bind the
 * fields directly (`bind:search={filters.values.search}`); call during component init.
 */
export function createListFilters<T extends FilterValues>(scope: string, defaults: T) {
  const values = $state<T>(loadFilters(scope, defaults));

  $effect(() => {
    saveFilters(scope, { ...values });
  });

  return {
    values,
    get isFiltered() {
      return hasActiveFilters(values, defaults);
    },
    reset() {
      Object.assign(values, defaults);
    },
  };
}
