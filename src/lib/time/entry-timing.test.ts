import { describe, expect, it } from "vitest";
import { elapsedMinutes, resolveTiming } from "./entry-timing";

const at = (h: number, m = 0, day = 5) => new Date(2026, 4, day, h, m).getTime() / 1000;
const DAY = at(0);

describe("elapsedMinutes", () => {
  it("rounds to the nearest minute", () => {
    expect(elapsedMinutes(0, 89)).toBe(1);
    expect(elapsedMinutes(0, 90)).toBe(2);
    expect(elapsedMinutes(0, 5400)).toBe(90);
  });

  it("counts at least one minute", () => {
    expect(elapsedMinutes(100, 100)).toBe(1);
    expect(elapsedMinutes(100, 110)).toBe(1);
  });
});

describe("resolveTiming", () => {
  it("derives the duration of a range from its ends", () => {
    expect(resolveTiming(DAY, { mode: "range", startedAt: at(9), endedAt: at(10, 30) })).toEqual({
      startedAt: at(9),
      endedAt: at(10, 30),
      durationMinutes: 90,
    });
  });

  it("stores a typed duration without clock times", () => {
    expect(resolveTiming(DAY, { mode: "duration", durationMinutes: 45 })).toEqual({
      startedAt: null,
      endedAt: null,
      durationMinutes: 45,
    });
  });

  it("rejects a range that ends before or when it starts", () => {
    expect(() => resolveTiming(DAY, { mode: "range", startedAt: at(10), endedAt: at(9) })).toThrow("nach dem Beginn");
    expect(() => resolveTiming(DAY, { mode: "range", startedAt: at(10), endedAt: at(10) })).toThrow("nach dem Beginn");
  });

  it("rejects a range that leaves the day of the entry", () => {
    expect(() => resolveTiming(DAY, { mode: "range", startedAt: at(23), endedAt: at(1, 0, 6) })).toThrow("am Tag");
    expect(() => resolveTiming(DAY, { mode: "range", startedAt: at(9, 0, 4), endedAt: at(10, 0, 4) })).toThrow("am Tag");
  });

  it.each([0, -5, 1.5, 24 * 60 + 1, Number.NaN])("rejects the duration %s", (durationMinutes) => {
    expect(() => resolveTiming(DAY, { mode: "duration", durationMinutes })).toThrow("zwischen 0:01 und 24:00");
  });

  it("accepts the boundaries of one minute and a full day", () => {
    expect(resolveTiming(DAY, { mode: "duration", durationMinutes: 1 }).durationMinutes).toBe(1);
    expect(resolveTiming(DAY, { mode: "duration", durationMinutes: 1440 }).durationMinutes).toBe(1440);
  });
});
