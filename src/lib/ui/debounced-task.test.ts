import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedTask } from "./debounced-task";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createDebouncedTask", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once with the last argument after the delay", async () => {
    const run = vi.fn(async (q: string) => q.toUpperCase());
    const onResult = vi.fn();
    const task = createDebouncedTask({ run, onResult, onError: vi.fn(), delayMs: 100 });

    task.schedule("a");
    task.schedule("ab");
    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("AB", "ab");
  });

  it("drops the result of a call that was cancelled while in flight", async () => {
    const pending = deferred<string>();
    const onResult = vi.fn();
    const task = createDebouncedTask({
      run: () => pending.promise,
      onResult,
      onError: vi.fn(),
      delayMs: 10,
    });

    task.schedule("ab");
    await vi.advanceTimersByTimeAsync(10);
    task.cancel();
    pending.resolve("stale");
    await vi.advanceTimersByTimeAsync(0);

    expect(onResult).not.toHaveBeenCalled();
  });

  it("drops the result of an older call when a newer one was scheduled", async () => {
    const first = deferred<string>();
    const onResult = vi.fn();
    const task = createDebouncedTask({
      run: (q: string) => (q === "ab" ? first.promise : Promise.resolve("fresh")),
      onResult,
      onError: vi.fn(),
      delayMs: 10,
    });

    task.schedule("ab");
    await vi.advanceTimersByTimeAsync(10);
    task.schedule("abc");
    await vi.advanceTimersByTimeAsync(10);
    first.resolve("stale");
    await vi.advanceTimersByTimeAsync(0);

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("fresh", "abc");
  });

  it("runNow runs immediately and replaces a pending scheduled call", async () => {
    const run = vi.fn(async (q: string) => q);
    const onResult = vi.fn();
    const task = createDebouncedTask({ run, onResult, onError: vi.fn(), delayMs: 100 });

    task.schedule("typed");
    task.runNow("");
    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith("", "");
  });

  it("reports a failure of the latest call", async () => {
    const onError = vi.fn();
    const failure = new Error("db down");
    const task = createDebouncedTask({
      run: () => Promise.reject(failure),
      onResult: vi.fn(),
      onError,
      delayMs: 10,
    });

    task.schedule("x");
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledWith(failure);
  });
});
