import { describe, expect, it } from "vitest";
import { toUnix } from "$lib/utils/date";
import { resolveTaxYearWindow } from "./tax-year";

describe("resolveTaxYearWindow", () => {
  it("excludes midnight of January 1st of the following year for a past year", () => {
    const nextYearStart = toUnix(new Date(2026, 0, 1));
    const window = resolveTaxYearWindow(2025, toUnix(new Date(2026, 4, 17)));
    expect(window.cutoff).toBeLessThan(nextYearStart);
    expect(window.cutoff).toBeGreaterThanOrEqual(toUnix(new Date(2025, 11, 31, 23, 59, 59)));
  });

  it("counts the full year for a past year", () => {
    expect(resolveTaxYearWindow(2025, toUnix(new Date(2026, 4, 17))).daysElapsed).toBe(365);
  });

  it("stops at now for the running year", () => {
    const now = toUnix(new Date(2026, 4, 17, 12));
    const window = resolveTaxYearWindow(2026, now);
    expect(window.cutoff).toBe(now);
    expect(window.daysElapsed).toBe(137);
  });

  it("counts January 1st as day 1, all day long", () => {
    expect(resolveTaxYearWindow(2026, toUnix(new Date(2026, 0, 1))).daysElapsed).toBe(1);
    expect(resolveTaxYearWindow(2026, toUnix(new Date(2026, 0, 1, 23, 59, 59))).daysElapsed).toBe(1);
  });

  it("counts December 31st as the last day of the year", () => {
    const window = resolveTaxYearWindow(2026, toUnix(new Date(2026, 11, 31, 12)));
    expect(window.daysElapsed).toBe(365);
    expect(window.daysInYear).toBe(365);
  });

  it("counts February 29th as day 60 of a leap year", () => {
    expect(resolveTaxYearWindow(2028, toUnix(new Date(2028, 1, 29, 12))).daysElapsed).toBe(60);
  });

  it("uses 366 days for a leap year", () => {
    const window = resolveTaxYearWindow(2028, toUnix(new Date(2029, 4, 17)));
    expect(window.daysElapsed).toBe(366);
    expect(window.daysInYear).toBe(366);
  });

  it("counts calendar days across the switch to daylight saving time", () => {
    expect(resolveTaxYearWindow(2026, toUnix(new Date(2026, 2, 30, 0, 30))).daysElapsed).toBe(89);
  });

  it("puts the cutoff before the start of a future year", () => {
    const window = resolveTaxYearWindow(2030, toUnix(new Date(2026, 4, 17)));
    expect(window.cutoff).toBeLessThan(window.yearStart);
  });
});
