import { describe, expect, it } from "vitest";
import { parseRouteId } from "./route-id";

describe("parseRouteId", () => {
  it("parses a numeric id", () => {
    expect(parseRouteId("42")).toBe(42);
  });

  it("returns null for a missing or non-numeric id", () => {
    expect(parseRouteId(undefined)).toBeNull();
    expect(parseRouteId("abc")).toBeNull();
    expect(parseRouteId("")).toBeNull();
  });
});
