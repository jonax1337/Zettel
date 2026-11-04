import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismiss, PERSISTENT_TOAST, toast, toasts } from "./toast.svelte";

function clearAll() {
  for (const t of [...toasts.items]) dismiss(t.id);
}

describe("toast lifetimes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    clearAll();
    vi.useRealTimers();
  });

  it("keeps error toasts until they are dismissed", () => {
    const id = toast.error("Speichern fehlgeschlagen", "disk full");
    vi.advanceTimersByTime(10 * 60_000);
    expect(toasts.items.map((t) => t.id)).toContain(id);
    dismiss(id);
    expect(toasts.items).toHaveLength(0);
  });

  it("auto-dismisses success toasts", () => {
    toast.success("Gespeichert");
    expect(toasts.items).toHaveLength(1);
    vi.advanceTimersByTime(10_000);
    expect(toasts.items).toHaveLength(0);
  });

  it("keeps action toasts long enough to click, then dismisses them", () => {
    toast.action("PDF erstellt", { label: "Öffnen", onClick: () => {} });
    vi.advanceTimersByTime(5_000);
    expect(toasts.items).toHaveLength(1);
    vi.advanceTimersByTime(5_000);
    expect(toasts.items).toHaveLength(0);
  });

  it("keeps action toasts that ask for a decision when marked persistent", () => {
    const id = toast.action(
      "Update verfügbar",
      { label: "Installieren", onClick: () => {} },
      { duration: PERSISTENT_TOAST },
    );
    vi.advanceTimersByTime(10 * 60_000);
    expect(toasts.items.map((t) => t.id)).toContain(id);
  });
});
