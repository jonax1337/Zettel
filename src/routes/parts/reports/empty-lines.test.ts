import { describe, expect, it } from "vitest";
import { partitionEmptyLines } from "./empty-lines";

const isZero = (n: number) => n === 0;

describe("partitionEmptyLines", () => {
  it("hides empty lines and counts them", () => {
    expect(partitionEmptyLines([1, 0, 2, 0, 0], isZero, false)).toEqual({ lines: [1, 2], emptyCount: 3 });
  });

  it("keeps every line when empty ones are requested, still counting them", () => {
    expect(partitionEmptyLines([1, 0], isZero, true)).toEqual({ lines: [1, 0], emptyCount: 1 });
  });

  it("returns nothing to hide for a list without empty lines", () => {
    expect(partitionEmptyLines([3, 4], isZero, false)).toEqual({ lines: [3, 4], emptyCount: 0 });
  });
});
