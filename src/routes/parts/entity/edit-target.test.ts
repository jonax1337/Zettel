import { describe, expect, it } from "vitest";
import { fetchEditTarget, INVALID_ID_MESSAGE, parseId } from "./edit-target";

describe("parseId", () => {
  it("parses numeric ids", () => {
    expect(parseId("42")).toBe(42);
  });

  it("rejects missing and non-numeric ids", () => {
    expect(parseId(undefined)).toBeNull();
    expect(parseId("")).toBeNull();
    expect(parseId("abc")).toBeNull();
  });
});

describe("fetchEditTarget", () => {
  it("returns the fetched record with its id", async () => {
    const target = await fetchEditTarget("7", async (id) => ({ id }), "fehlt");
    expect(target).toEqual({ id: 7, value: { id: 7 } });
  });

  it("reports an invalid id without fetching", async () => {
    let fetched = false;
    const target = await fetchEditTarget(
      "abc",
      async () => {
        fetched = true;
        return {};
      },
      "fehlt",
    );
    expect(target).toEqual({ error: INVALID_ID_MESSAGE });
    expect(fetched).toBe(false);
  });

  it("reports a missing record with the given message", async () => {
    expect(await fetchEditTarget("7", async () => null, "Kunde nicht gefunden.")).toEqual({
      error: "Kunde nicht gefunden.",
    });
  });
});
