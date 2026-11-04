import { loadSortState, saveSortState, type SortState } from "$lib/utils/sort";

/** Persisted sort state of a list table; `change` plugs straight into `SortableTh`'s `onChange`. */
export function createListSort<K extends string>(scope: string, fallback: SortState<K>) {
  let state = $state<SortState<K>>(loadSortState<K>(scope, fallback));

  return {
    get state() {
      return state;
    },
    change(key: K, dir: SortState<K>["dir"]) {
      state = { key: dir === null ? null : key, dir };
      saveSortState(scope, state);
    },
  };
}
