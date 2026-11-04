import { push } from "svelte-spa-router";
import { toast } from "$lib/ui/toast.svelte";
import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
import { fetchEditTarget } from "./edit-target";

type Options<T> = {
  mode: () => "new" | "edit";
  fetchById: (id: number) => Promise<T | null>;
  notFoundMessage: string;
  /** Copies the loaded record into the page's form state. */
  onLoaded: (value: T) => void;
  /** Resolves to the new record's ID. */
  create: () => Promise<number>;
  update: (id: number) => Promise<unknown>;
  createdMessage: string;
  /** Where a saved or cancelled form returns to. */
  listRoute: string;
  /** Everything the user edits; leaving with changes asks for confirmation. */
  unsavedState: () => unknown;
};

/** Load/save lifecycle shared by the customer, vendor and catalog edit pages. */
export function createEntityForm<T>(options: Options<T>) {
  let id = $state<number | null>(null);
  let loaded = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const loading = $derived(options.mode() === "edit" && !loaded);
  const unsaved = guardUnsavedChanges(options.unsavedState, () => !loading);

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

  async function persist(): Promise<number> {
    if (options.mode() === "new") {
      const createdId = await options.create();
      toast.success(options.createdMessage);
      return createdId;
    }
    if (id === null) throw new Error("Keine ID");
    await options.update(id);
    toast.success("Änderungen gespeichert");
    return id;
  }

  /** Returns to the list, or to the route `nextRoute` builds from the saved record's ID. */
  async function save(nextRoute?: (savedId: number) => string) {
    saving = true;
    error = null;
    try {
      const savedId = await persist();
      unsaved.markClean();
      push(nextRoute ? nextRoute(savedId) : options.listRoute);
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
