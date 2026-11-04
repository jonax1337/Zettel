import { onDestroy, untrack } from "svelte";
import { dirtyForms, isEdited, snapshotOf } from "./unsaved-guard";

/** Destination hash of a navigation that is waiting for the user's decision, if any. */
export const pendingNavigation = $state<{ target: string | null }>({ target: null });

let acceptedHash = typeof window === "undefined" ? "" : window.location.hash;
let letNextNavigationThrough = false;

// Registered in the capture phase and before the router module loads, so a
// blocked navigation never reaches svelte-spa-router (which would swap the page
// and drop the form state).
function onHashChange(event: Event) {
  const hash = window.location.hash;
  if (letNextNavigationThrough || !dirtyForms.isDirty()) {
    letNextNavigationThrough = false;
    acceptedHash = hash;
    return;
  }
  event.stopImmediatePropagation();
  pendingNavigation.target = hash;
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (dirtyForms.isDirty()) event.preventDefault();
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", onHashChange, true);
  window.addEventListener("beforeunload", onBeforeUnload);
}

export function stayOnPage() {
  pendingNavigation.target = null;
  // Restores the address bar without firing another hashchange.
  history.replaceState(history.state, "", acceptedHash || "#/");
}

export function leavePage() {
  pendingNavigation.target = null;
  letNextNavigationThrough = true;
  window.dispatchEvent(new Event("hashchange"));
}

/**
 * Warns before navigating away from a form with unsaved edits. Call during
 * component init. `ready` holds off the baseline until the form has loaded its
 * data; call `markClean()` right before navigating after a successful save.
 */
export function guardUnsavedChanges(read: () => unknown, ready: () => boolean = () => true) {
  let baseline = $state<string | null>(null);

  $effect(() => {
    if (!ready()) return;
    untrack(() => {
      if (baseline === null) baseline = snapshotOf(read());
    });
  });

  const dirty = $derived(isEdited(baseline, read()));
  onDestroy(dirtyForms.register(() => dirty));

  return {
    get dirty() {
      return dirty;
    },
    markClean() {
      baseline = snapshotOf(read());
    },
  };
}
