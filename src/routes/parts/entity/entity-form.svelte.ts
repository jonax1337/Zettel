import { push } from "svelte-spa-router";
import { toast } from "$lib/ui/toast.svelte";
import { fetchEditTarget } from "./edit-target";

type Options<T> = {
  mode: () => "new" | "edit";
  fetchById: (id: number) => Promise<T | null>;
  notFoundMessage: string;
  /** Copies the loaded record into the page's form state. */
  onLoaded: (value: T) => void;
  create: () => Promise<unknown>;
  update: (id: number) => Promise<unknown>;
  createdMessage: string;
  /** Where a saved or cancelled form returns to. */
  listRoute: string;
};

/** Load/save lifecycle shared by the customer, vendor and catalog edit pages. */
export function createEntityForm<T>(options: Options<T>) {
  let id = $state<number | null>(null);
  let loaded = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const loading = $derived(options.mode() === "edit" && !loaded);

  async function loadTarget(rawId: string | undefined) {
    try {
      const target = await fetchEditTarget(rawId, options.fetchById, options.notFoundMessage);
      if ("error" in target) {
        error = target.error;
      } else {
        id = target.id;
        options.onLoaded(target.value);
      }
    } catch (e) {
      error = String(e);
    } finally {
      loaded = true;
    }
  }

  function reject(title: string, message: string) {
    error = message;
    toast.error(title, message);
  }

  async function persist() {
    if (options.mode() === "new") {
      await options.create();
      toast.success(options.createdMessage);
    } else if (id !== null) {
      await options.update(id);
      toast.success("Änderungen gespeichert");
    } else {
      throw new Error("Keine ID");
    }
  }

  async function save() {
    saving = true;
    error = null;
    try {
      await persist();
      push(options.listRoute);
    } catch (e) {
      reject("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }

  return {
    get loading() {
      return loading;
    },
    get saving() {
      return saving;
    },
    get error() {
      return error;
    },
    loadTarget,
    reject,
    save,
  };
}
