import { describe, expect, it } from "vitest";
import { groupByDay } from "./day-groups";

const day = (d: number) => new Date(2026, 4, d).getTime() / 1000;
const entry = (id: number, entryDate: number, durationMinutes: number | null) => ({ id, entryDate, durationMinutes });

describe("groupByDay", () => {
  it("keeps the order of the rows and groups the ones of the same day", () => {
    const groups = groupByDay([entry(1, day(6), 60), entry(2, day(6), 30), entry(3, day(5), 45)]);

    expect(groups.map((g) => [g.entryDate, g.entries.map((e) => e.id)])).toEqual([
      [day(6), [1, 2]],
      [day(5), [3]],
    ]);
  });

  it("sums the minutes of finished entries and skips a running timer", () => {
    const [group] = groupByDay([entry(1, day(6), 60), entry(2, day(6), null), entry(3, day(6), 30)]);

    expect(group.finishedMinutes).toBe(90);
  });

  it("labels a day with its weekday and date", () => {
    expect(groupByDay([entry(1, day(4), 10)])[0].label).toBe("Montag, 04.05.2026");
  });

  it("returns no groups without rows", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
