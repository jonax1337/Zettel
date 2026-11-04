import { describe, expect, it } from "vitest";
import { fromIsoDate } from "$lib/utils/date";
import { selectableTaxYears, taxYearOfPeriod } from "./tax-years";

describe("taxYearOfPeriod", () => {
  it("maps the period start to its calendar year", () => {
    expect(taxYearOfPeriod({ start: fromIsoDate("2025-01-01") })).toBe(2025);
    expect(taxYearOfPeriod({ start: fromIsoDate("2025-10-01") })).toBe(2025);
    expect(taxYearOfPeriod({ start: fromIsoDate("2025-12-31") })).toBe(2025);
  });
});

describe("selectableTaxYears", () => {
  it("offers two years back and one ahead, sorted", () => {
    expect(selectableTaxYears(2026, 2026)).toEqual([2024, 2025, 2026, 2027]);
  });

  it("moves with the current year", () => {
    expect(selectableTaxYears(2029, 2029)).toEqual([2027, 2028, 2029, 2030]);
  });

  it("keeps a selected year outside the window selectable", () => {
    expect(selectableTaxYears(2026, 2020)).toEqual([2020, 2024, 2025, 2026, 2027]);
  });
});
