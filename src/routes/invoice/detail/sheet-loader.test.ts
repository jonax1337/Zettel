import { describe, expect, it } from "vitest";
import { createSheetLoader } from "./sheet-loader.svelte";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSheetLoader", () => {
  it("shows the rendered sheet", async () => {
    const loader = createSheetLoader(async (id) => `<p>${id}</p>`);
    await loader.load(1, "a");
    expect(loader.html).toBe("<p>1</p>");
    expect(loader.loading).toBe(false);
    expect(loader.error).toBeNull();
  });

  it("keeps the old sheet while the same document renders again", async () => {
    const second = deferred<string>();
    let calls = 0;
    const loader = createSheetLoader(() => (++calls === 1 ? Promise.resolve("old") : second.promise));
    await loader.load(1, "a");
    const reload = loader.load(1, "b");
    expect(loader.html).toBe("old");
    expect(loader.loading).toBe(true);
    second.resolve("new");
    await reload;
    expect(loader.html).toBe("new");
  });

  it("starts blank for another document", async () => {
    const pending = deferred<string>();
    let calls = 0;
    const loader = createSheetLoader(() => (++calls === 1 ? Promise.resolve("first") : pending.promise));
    await loader.load(1, "a");
    const next = loader.load(2, "a");
    expect(loader.html).toBeNull();
    pending.resolve("second");
    await next;
    expect(loader.html).toBe("second");
  });

  it("ignores an answer that arrives after a newer request", async () => {
    const slow = deferred<string>();
    let calls = 0;
    const loader = createSheetLoader(() => (++calls === 1 ? slow.promise : Promise.resolve("fresh")));
    const stale = loader.load(1, "a");
    await loader.load(1, "a");
    slow.resolve("stale");
    await stale;
    expect(loader.html).toBe("fresh");
  });

  it("reports a failed render and keeps the previous sheet", async () => {
    let calls = 0;
    const loader = createSheetLoader(async () => {
      if (++calls === 2) throw new Error("Sidecar nicht erreichbar");
      return "ok";
    });
    await loader.load(1, "a");
    await loader.load(1, "b");
    expect(loader.error).toBe("Sidecar nicht erreichbar");
    expect(loader.html).toBe("ok");
    expect(loader.loading).toBe(false);
  });

  it("drops an old error when the next render succeeds", async () => {
    let calls = 0;
    const loader = createSheetLoader(async () => {
      if (++calls === 1) throw new Error("boom");
      return "ok";
    });
    await loader.load(1, "a");
    await loader.load(1, "a");
    expect(loader.error).toBeNull();
    expect(loader.html).toBe("ok");
  });

  it("does not render again while the key stays the same", async () => {
    let calls = 0;
    const loader = createSheetLoader(async () => `render ${++calls}`);
    await loader.load(1, "a");
    await loader.load(1, "a");
    expect(calls).toBe(1);
    await loader.load(1, "b");
    expect(calls).toBe(2);
    expect(loader.html).toBe("render 2");
  });

  it("renders again after invalidate even with the same key", async () => {
    let calls = 0;
    const loader = createSheetLoader(async () => `render ${++calls}`);
    await loader.load(1, "a");
    loader.invalidate();
    await loader.load(1, "a");
    expect(loader.html).toBe("render 2");
  });

  it("renders again after a failure even with the same key", async () => {
    let calls = 0;
    const loader = createSheetLoader(async () => {
      if (++calls === 1) throw new Error("boom");
      return "ok";
    });
    await loader.load(1, "a");
    await loader.load(1, "a");
    expect(loader.html).toBe("ok");
    expect(loader.error).toBeNull();
  });

  it("ignores an answer that arrives after the shown state came back", async () => {
    const inFlight = deferred<string>();
    let calls = 0;
    const loader = createSheetLoader(() => (++calls === 1 ? Promise.resolve("with payment") : inFlight.promise));
    await loader.load(1, "paid");
    const render = loader.load(1, "removed");
    await loader.load(1, "paid");
    inFlight.resolve("payment removed");
    await render;
    expect(loader.html).toBe("with payment");
    expect(loader.loading).toBe(false);
  });

  it("drops the previous document's error when another document is shown", async () => {
    const second = deferred<string>();
    let calls = 0;
    const loader = createSheetLoader(() => {
      if (++calls === 1) return Promise.reject(new Error("Sheet kaputt"));
      return second.promise;
    });
    await loader.load(1, "a");
    expect(loader.error).toBe("Sheet kaputt");
    const next = loader.load(2, "a");
    expect(loader.error).toBeNull();
    expect(loader.html).toBeNull();
    second.resolve("second");
    await next;
    expect(loader.html).toBe("second");
  });

  it("renders the first document again after a detour through another one", async () => {
    let calls = 0;
    const loader = createSheetLoader(async (id) => `doc ${id} render ${++calls}`);
    await loader.load(1, "a");
    await loader.load(2, "a");
    await loader.load(1, "a");
    expect(loader.html).toBe("doc 1 render 3");
  });

  it("forgets everything on clear", async () => {
    const loader = createSheetLoader(async () => "ok");
    await loader.load(1, "a");
    loader.clear();
    expect(loader.html).toBeNull();
  });
});
