import { describe, expect, it } from "vitest";
import { isReminderLevel, nextReminderLevel } from "./reminder-levels";

describe("nextReminderLevel", () => {
  it("starts with the payment reminder", () => {
    expect(nextReminderLevel([])).toBe(1);
  });

  it("escalates one level at a time", () => {
    expect(nextReminderLevel([1])).toBe(2);
    expect(nextReminderLevel([1, 2])).toBe(3);
    expect(nextReminderLevel([2])).toBe(3);
  });
});

describe("isReminderLevel", () => {
  it("accepts only levels 1 to 3", () => {
    expect([0, 1, 2, 3, 4].filter(isReminderLevel)).toEqual([1, 2, 3]);
  });
});
