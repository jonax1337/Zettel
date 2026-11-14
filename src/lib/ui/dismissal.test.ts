import { describe, expect, it, vi } from "vitest";
import { createDismissalTracker } from "./dismissal";

describe("createDismissalTracker", () => {
  it("reports a close that was not confirmed", () => {
    const onDismissed = vi.fn();
    const tracker = createDismissalTracker(onDismissed);

    tracker.sync(true);
    tracker.sync(false);

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it("stays silent after a confirmed close", () => {
    const onDismissed = vi.fn();
    const tracker = createDismissalTracker(onDismissed);

    tracker.sync(true);
    tracker.markConfirmed();
    tracker.sync(false);

    expect(onDismissed).not.toHaveBeenCalled();
  });

  it("reports a dismissal on the next opening after a confirmed one", () => {
    const onDismissed = vi.fn();
    const tracker = createDismissalTracker(onDismissed);

    tracker.sync(true);
    tracker.markConfirmed();
    tracker.sync(false);
    tracker.sync(true);
    tracker.sync(false);

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it("reports one close once, however often it is synced", () => {
    const onDismissed = vi.fn();
    const tracker = createDismissalTracker(onDismissed);

    tracker.sync(true);
    tracker.sync(false);
    tracker.sync(false);

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it("treats a close after a failed confirmation as a dismissal", () => {
    const onDismissed = vi.fn();
    const tracker = createDismissalTracker(onDismissed);

    tracker.sync(true);
    tracker.markConfirmed();
    tracker.unmarkConfirmed();
    tracker.sync(false);

    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the confirmed action closes the dialog before it finishes", () => {
    const onDismissed = vi.fn();
    const tracker = createDismissalTracker(onDismissed);

    tracker.sync(true);
    tracker.markConfirmed();
    tracker.sync(false);
    tracker.sync(false);

    expect(onDismissed).not.toHaveBeenCalled();
  });

  it("ignores a dialog that was never opened", () => {
    const onDismissed = vi.fn();
    const tracker = createDismissalTracker(onDismissed);

    tracker.sync(false);

    expect(onDismissed).not.toHaveBeenCalled();
  });
});
