import { describe, expect, it } from "vitest";
import { toUnix } from "$lib/utils/date";
import { bucketExpectedPayments, isoWeekNumber, startOfWeekUnix } from "./weeks";

const at = (year: number, month: number, day: number, hour = 12) => toUnix(new Date(year, month - 1, day, hour));

describe("startOfWeekUnix", () => {
  it("returns local midnight of the Monday", () => {
    expect(startOfWeekUnix(at(2026, 11, 27))).toBe(at(2026, 11, 23, 0));
  });

  it("keeps a Sunday in the week that started six days before", () => {
    expect(startOfWeekUnix(at(2026, 11, 29, 23))).toBe(at(2026, 11, 23, 0));
  });

  it("returns a Monday itself", () => {
    expect(startOfWeekUnix(at(2026, 11, 30, 0))).toBe(at(2026, 11, 30, 0));
  });
});

describe("isoWeekNumber", () => {
  it.each([
    [[2026, 11, 23], 48],
    [[2026, 1, 1], 1],
    [[2026, 12, 28], 53],
    [[2025, 12, 29], 1],
    [[2027, 1, 4], 1],
    [[2024, 12, 30], 1],
  ])("numbers the week of the Monday %j as %i", ([year, month, day], week) => {
    expect(isoWeekNumber(at(year, month, day, 0))).toBe(week);
  });
});

describe("bucketExpectedPayments", () => {
  const now = at(2026, 11, 27);
  const horizon = at(2026, 12, 27);

  it("lists every calendar week from the current one up to the horizon, empty ones included", () => {
    const { weeks } = bucketExpectedPayments(now, horizon, [], []);

    expect(weeks.map((w) => w.weekNumber)).toEqual([48, 49, 50, 51, 52]);
  });

  it("counts an invoice due at the horizon and ignores one a second later", () => {
    const { weeks } = bucketExpectedPayments(
      now,
      horizon,
      [
        { dueDate: horizon, balance: 100 },
        { dueDate: horizon + 1, balance: 900 },
      ],
      [],
    );

    expect(weeks.at(-1)).toMatchObject({ openCent: 100, openCount: 1 });
  });

  it("treats an invoice due right now as expected, not overdue", () => {
    const { overdue, weeks } = bucketExpectedPayments(now, horizon, [{ dueDate: now, balance: 50 }], []);

    expect(overdue.count).toBe(0);
    expect(weeks[0].openCent).toBe(50);
  });

  it("puts an already due template into the current week", () => {
    const { weeks } = bucketExpectedPayments(now, horizon, [], [{ dueDate: at(2026, 11, 1), grossCent: 700 }]);

    expect(weeks[0]).toMatchObject({ estimateCent: 700, estimateCount: 1 });
  });

  it("sums negative balances too, as an overpaid invoice nets against the rest", () => {
    const { overdue } = bucketExpectedPayments(now, horizon, [{ dueDate: at(2026, 11, 1), balance: -200 }], []);

    expect(overdue).toEqual({ count: 1, total: -200 });
  });
});
