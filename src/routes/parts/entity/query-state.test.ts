import { describe, expect, it } from "vitest";
import { createQueryState } from "./query-state.svelte";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createQueryState", () => {
  it("exposes the fetched data and clears loading", async () => {
    const state = createQueryState<string[]>([], async () => ["a"]);
    expect(state.loading).toBe(true);
    await state.reload();
    expect(state.data).toEqual(["a"]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("reports a failed fetch and keeps the previous data", async () => {
    let fail = false;
    const state = createQueryState<string[]>([], async () => {
      if (fail) throw new Error("kaputt");
      return ["a"];
    });
    await state.reload();
    fail = true;
    await state.reload();
    expect(state.error).toBe("Error: kaputt");
    expect(state.data).toEqual(["a"]);
    expect(state.loading).toBe(false);
  });

  it("ignores the outcome of a request that was superseded by a newer one", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const pending = [first, second];
    const state = createQueryState<string>("", () => pending.shift()!.promise);

    const firstReload = state.reload();
    const secondReload = state.reload();
    second.resolve("neu");
    await secondReload;
    first.resolve("alt");
    await firstReload;

    expect(state.data).toBe("neu");
    expect(state.loading).toBe(false);
  });

  it("does not let a superseded failure clobber the newer result", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const pending = [first, second];
    const state = createQueryState<string>("", () => pending.shift()!.promise);

    const firstReload = state.reload();
    const secondReload = state.reload();
    second.resolve("neu");
    await secondReload;
    first.reject(new Error("alt"));
    await firstReload;

    expect(state.data).toBe("neu");
    expect(state.error).toBeNull();
  });
});
