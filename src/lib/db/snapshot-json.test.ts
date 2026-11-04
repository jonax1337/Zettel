import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSnapshot } from "./snapshot-json";

afterEach(() => vi.restoreAllMocks());

describe("parseSnapshot", () => {
  it("returns the parsed object", () => {
    expect(parseSnapshot<{ name: string }>('{"name":"Acme"}', "Test").name).toBe("Acme");
  });

  it("falls back to an empty snapshot and warns with the context for broken JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(parseSnapshot("{", "Kundensnapshot RE-1")).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("Kundensnapshot RE-1");
  });

  it("treats valid JSON that is not an object as unreadable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(parseSnapshot("null", "Test")).toEqual({});
    expect(parseSnapshot("42", "Test")).toEqual({});
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
