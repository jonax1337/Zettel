import { toast } from "$lib/ui/toast.svelte";

type DeleteFlowOptions<T> = {
  remove: (item: T) => Promise<unknown>;
  /** Singular noun for the success toast: "Kunde" -> "Kunde gelöscht". */
  entityLabel: string;
  /** Name quoted in the success toast; omit when the label alone says enough. */
  describe?: (item: T) => string;
  reload: () => Promise<void>;
};

/** Ask-confirm-delete cycle of a list row: the dialog binds to `open`, the row action calls `ask`. */
export function createDeleteFlow<T>({ remove, entityLabel, describe, reload }: DeleteFlowOptions<T>) {
  let open = $state(false);
  let target = $state<T | null>(null);

  function ask(item: T) {
    target = item;
    open = true;
  }

  async function confirm() {
    if (!target) return;
    const item = target;
    try {
      await remove(item);
      toast.success(`${entityLabel} gelöscht`, describe && `"${describe(item)}" wurde entfernt.`);
      target = null;
      await reload();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }

  return {
    get open() {
      return open;
    },
    set open(value: boolean) {
      open = value;
    },
    get target() {
      return target;
    },
    ask,
    confirm,
  };
}
