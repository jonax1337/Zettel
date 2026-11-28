import { describe, expect, it } from "vitest";
import type { UstvaReport, UstvaRow } from "$lib/reports/ustva";
import { isEmptyUstvaRow, isUstvaQuarterRunning, payableLabel } from "./ustva-view";

const quarter4: UstvaReport = { year: 2026, quarter: 4, dateFrom: 0, dateTo: 0, vatAccounting: "accrual", rows: [] };
const at = (year: number, month: number, day: number) => Math.floor(new Date(year, month - 1, day, 12).getTime() / 1000);

describe("isUstvaQuarterRunning", () => {
  it("is true inside the quarter, also on its last day", () => {
    expect(isUstvaQuarterRunning(quarter4, at(2026, 11, 27))).toBe(true);
    expect(isUstvaQuarterRunning(quarter4, at(2026, 12, 31))).toBe(true);
  });

  it("is false once the quarter is over or before it starts", () => {
    expect(isUstvaQuarterRunning(quarter4, at(2027, 1, 5))).toBe(false);
    expect(isUstvaQuarterRunning(quarter4, at(2026, 9, 30))).toBe(false);
  });
});

describe("payableLabel", () => {
  it("adds bisher only while running and names a refund Erstattung", () => {
    expect(payableLabel(100, true)).toBe("Zahllast bisher");
    expect(payableLabel(100, false)).toBe("Zahllast");
    expect(payableLabel(-100, true)).toBe("Erstattung bisher");
    expect(payableLabel(-100, false)).toBe("Erstattung");
  });
});

describe("isEmptyUstvaRow", () => {
  it("treats only zero amounts as empty", () => {
    const row = (amount: number): UstvaRow => ({ kz: "81", label: "", amount, wholeEuros: true, computedFrom: "" });
    expect(isEmptyUstvaRow(row(0))).toBe(true);
    expect(isEmptyUstvaRow(row(100))).toBe(false);
  });
});