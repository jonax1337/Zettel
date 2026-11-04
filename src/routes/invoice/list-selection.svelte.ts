import { toast } from "$lib/ui";

/** Checkbox selection over the currently visible list rows, plus bulk actions on it. */
export function createRowSelection<T extends { id: number }>(getRows: () => T[]) {
  let ids = $state(new Set<number>());
  let busy = $state(false);

  // Only ids that are still visible count; filters can hide previously selected rows.
  const selected = $derived(getRows().filter((row) => ids.has(row.id)));
  const allSelected = $derived(selected.length > 0 && selected.length === getRows().length);

  function toggle(id: number) {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    ids = next;
  }

  function clear() {
    ids = new Set();
  }

  function toggleAll() {
    if (allSelected) clear();
    else ids = new Set(getRows().map((row) => row.id));
  }

  async function runBulk(
    doneLabel: string,
    action: (id: number) => Promise<unknown>,
    reload: () => Promise<void>,
  ) {
    const targets = selected;
    busy = true;
    try {
      for (const row of targets) await action(row.id);
      toast.success(`${targets.length} ${doneLabel}`);
      clear();
    } catch (e) {
      toast.error("Bulk-Aktion fehlgeschlagen", String(e));
    } finally {
      busy = false;
    }
    await reload();
  }

  return {
    get selected() {
      return selected;
    },
    get allSelected() {
      return allSelected;
    },
    get busy() {
      return busy;
    },
    isSelected: (id: number) => ids.has(id),
    toggle,
    toggleAll,
    clear,
    runBulk,
  };
}
