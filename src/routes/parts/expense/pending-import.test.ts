import { describe, expect, it, vi } from "vitest";
import { importWhenReady, setPendingImport, takePendingImport } from "./pending-import";

describe("pending import", () => {
  it("hands the path over exactly once", () => {
    setPendingImport("C:/belege/a.pdf");
    expect(takePendingImport()).toBe("C:/belege/a.pdf");
    expect(takePendingImport()).toBeNull();
  });
});

describe("importWhenReady", () => {
  it("waits for the data, then imports", async () => {
    const run = vi.fn();
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => (finish = resolve));
    const done = importWhenReady("a.pdf", ready, () => true, run);
    await Promise.resolve();
    expect(run).not.toHaveBeenCalled();
    finish();
    await done;
    expect(run).toHaveBeenCalledWith("a.pdf");
  });

  it("still imports when loading failed", async () => {
    const run = vi.fn();
    await importWhenReady("a.pdf", Promise.reject(new Error("db")), () => true, run);
    expect(run).toHaveBeenCalledOnce();
  });

  it("does nothing once the editor is gone", async () => {
    const run = vi.fn();
    await importWhenReady("a.pdf", Promise.resolve(), () => false, run);
    expect(run).not.toHaveBeenCalled();
  });
});
