import { describe, expect, it } from "vitest";
import { cycleIndex } from "./list-navigation";

describe("cycleIndex", () => {
  it("steps forward and backward inside the list", () => {
    expect(cycleIndex(1, 1, 5)).toBe(2);
    expect(cycleIndex(3, -1, 5)).toBe(2);
  });
  it("wraps from the last entry to the first", () => {
    expect(cycleIndex(4, 1, 5)).toBe(0);
  });
  it("wraps from the first entry to the last", () => {
    expect(cycleIndex(0, -1, 5)).toBe(4);
  });
  it("stays at 0 for an empty list", () => {
    expect(cycleIndex(0, 1, 0)).toBe(0);
    expect(cycleIndex(0, -1, 0)).toBe(0);
  });
  it("stays at 0 for a single entry", () => {
    expect(cycleIndex(0, 1, 1)).toBe(0);
    expect(cycleIndex(0, -1, 1)).toBe(0);
  });
});
