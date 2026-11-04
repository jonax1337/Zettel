import { describe, expect, it } from "vitest";
import { fromIsoDate } from "$lib/utils/date";
import { periodFromSelection, type PeriodSelection } from "./period-selection";

const base: PeriodSelection = {
  type: "year",
  year: 2026,
  quarter: 2,
  month: 5,
  customFrom: "",
  customTo: "",
};

describe("periodFromSelection", () => {
  it("builds year, quarter and month periods from the selected values", () => {
    expect(periodFromSelection(base)?.label).toBe("2026");
    expect(periodFromSelection({ ...base, type: "quarter" })?.label).toBe("Q2 2026");
    expect(periodFromSelection({ ...base, type: "month" })?.label).toBe("Mai 2026");
  });

  it("ends a custom period at the local midnight after the last selected day", () => {
    const period = periodFromSelection({
      ...base,
      type: "custom",
      customFrom: "2026-10-01",
      customTo: "2026-10-31",
    });
    expect(period?.start).toBe(fromIsoDate("2026-10-01"));
    expect(period?.end).toBe(fromIsoDate("2026-11-01"));
  });

  it("includes the whole last day when it is a daylight-saving change day", () => {
    const period = periodFromSelection({
      ...base,
      type: "custom",
      customFrom: "2026-10-20",
      customTo: "2026-10-25",
    });
    expect(period?.end).toBe(fromIsoDate("2026-10-26"));
  });

  it("returns null for an incomplete custom range", () => {
    expect(periodFromSelection({ ...base, type: "custom", customFrom: "2026-01-01" })).toBeNull();
    expect(periodFromSelection({ ...base, type: "custom", customTo: "2026-01-31" })).toBeNull();
  });

  it("returns null when the custom range ends before it starts", () => {
    expect(
      periodFromSelection({
        ...base,
        type: "custom",
        customFrom: "2026-02-10",
        customTo: "2026-02-09",
      }),
    ).toBeNull();
  });

  it("accepts a single-day custom range", () => {
    const period = periodFromSelection({
      ...base,
      type: "custom",
      customFrom: "2026-02-10",
      customTo: "2026-02-10",
    });
    expect(period?.start).toBe(fromIsoDate("2026-02-10"));
    expect(period?.end).toBe(fromIsoDate("2026-02-11"));
  });
});
