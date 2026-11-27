import { describe, expect, it } from "vitest";
import { SECONDS_PER_DAY } from "$lib/utils/date";
import { daysOverdue, overdueLabel } from "./overdue";

const DUE = 1_700_000_000;

describe("daysOverdue", () => {
  it("is 0 within the first day after the due date", () => {
    expect(daysOverdue(DUE, DUE + 60)).toBe(0);
    expect(daysOverdue(DUE, DUE + SECONDS_PER_DAY - 1)).toBe(0);
  });

  it("counts whole days", () => {
    expect(daysOverdue(DUE, DUE + SECONDS_PER_DAY)).toBe(1);
    expect(daysOverdue(DUE, DUE + 24 * SECONDS_PER_DAY + 3_600)).toBe(24);
  });

  it("is never negative", () => {
    expect(daysOverdue(DUE, DUE - SECONDS_PER_DAY)).toBe(0);
  });
});

describe("overdueLabel", () => {
  it("says only 'Überfällig' before a full day has passed", () => {
    expect(overdueLabel(0)).toBe("Überfällig");
  });

  it("uses the singular for one day", () => {
    expect(overdueLabel(1)).toBe("1 Tag überfällig");
  });

  it("uses the plural otherwise", () => {
    expect(overdueLabel(24)).toBe("24 Tage überfällig");
  });
});
