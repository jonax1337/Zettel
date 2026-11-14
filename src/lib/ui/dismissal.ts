/**
 * Tells a dialog's owner when it was closed without being confirmed (Escape,
 * outside click, cancel button, or the parent clearing `open`), whichever way
 * that happened. Feed it every value of `open`; confirm before closing.
 */
export function createDismissalTracker(onDismissed: () => void) {
  let wasOpen = false;
  let confirmed = false;

  return {
    markConfirmed() {
      confirmed = true;
    },
    /** The confirmed action failed and the dialog stays open. */
    unmarkConfirmed() {
      confirmed = false;
    },
    sync(open: boolean) {
      if (open) {
        wasOpen = true;
        return;
      }
      if (!wasOpen) return;
      wasOpen = false;
      const wasConfirmed = confirmed;
      confirmed = false;
      if (!wasConfirmed) onDismissed();
    },
  };
}
