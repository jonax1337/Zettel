import { describe, expect, it } from "vitest";
import { SECONDS_PER_DAY } from "$lib/utils/date";
import { ageBucketOf, bucketByAge, overdueOf } from "./age-buckets";

const NOW = 1_800_000_000;
const overdueByDays = (days: number) => NOW - days * SECONDS_PER_DAY;

describe("ageBucketOf", () => {
  it.each([
    [NOW + SECONDS_PER_DAY, "notDue"],
    [NOW, "notDue"],
    [NOW - 1, "days1to14"],
    [overdueByDays(14), "days1to14"],
    [overdueByDays(14) - 1, "days1to14"],
    [overdueByDays(15), "days15to30"],
    [overdueByDays(31) + 1, "days15to30"],
    [overdueByDays(31), "over30"],
    [overdueByDays(400), "over30"],
  ])("puts a due date of %i into %s", (dueDate, bucket) => {
    expect(ageBucketOf(dueDate, NOW)).toBe(bucket);
  });
});

describe("bucketByAge", () => {
  it("returns the four buckets in order, empty when there are no invoices", () => {
    expect(bucketByAge([], NOW)).toEqual([
      { id: "notDue", count: 0, total: 0 },
      { id: "days1to14", count: 0, total: 0 },
      { id: "days15to30", count: 0, total: 0 },
      { id: "over30", count: 0, total: 0 },
    ]);
  });

  it("splits overdue from not yet due for the overdue summary", () => {
    const buckets = bucketByAge(
      [
        { dueDate: NOW + 5, balance: 10 },
        { dueDate: overdueByDays(2), balance: 20 },
        { dueDate: overdueByDays(60), balance: 40 },
      ],
      NOW,
    );

    expect(overdueOf(buckets)).toEqual({ count: 2, total: 60 });
  });
});
