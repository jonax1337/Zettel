import { untrack } from "svelte";
import { snapshotOf } from "$lib/utils/unsaved-guard";

/**
 * The message of the last failed save. It disappears when a new attempt starts and
 * as soon as the form changes, so it never hides the validation messages of the new state.
 * Call during component init.
 */
export function createSaveError(formState: () => unknown) {
  let message = $state<string | null>(null);
  let lastSnapshot: string | null = null;

  $effect(() => {
    const snapshot = snapshotOf(formState());
    untrack(() => {
      if (lastSnapshot !== null && snapshot !== lastSnapshot) message = null;
      lastSnapshot = snapshot;
    });
  });

  return {
    get message() {
      return message;
    },
    set(next: string) {
      message = next;
    },
    clear() {
      message = null;
    },
  };
}
