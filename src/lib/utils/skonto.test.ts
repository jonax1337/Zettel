import { describe, expect, it } from "vitest";
import { computeSkonto, formatSkontoLineDe, isSkontoActive } from "./skonto";

const ISSUE = 1714521600; // 2024-05-01

describe("isSkontoActive", () => {
  it("rejects when percent is 0", () => {
    expect(isSkontoActive({ totalCent: 10000, percent: 0, days: 7, issueDate: ISSUE })).toBe(false);
  });
  it("rejects when days is 0", () => {
    expect(isSkontoActive({ totalCent: 10000, percent: 2, days: 0, issueDate: ISSUE })).toBe(false);
  });
  it("rejects on credit note", () => {
    expect(
      isSkontoActive({ totalCent: 10000, percent: 2, days: 7, issueDate: ISSUE, isCreditNote: true }),
    ).toBe(false);
  });
  it("rejects when totalCent is 0", () => {
    expect(isSkontoActive({ totalCent: 0, percent: 2, days: 7, issueDate: ISSUE })).toBe(false);
  });
  it("rejects null values", () => {
    expect(isSkontoActive({ totalCent: 10000, percent: null, days: 7, issueDate: ISSUE })).toBe(false);
    expect(isSkontoActive({ totalCent: 10000, percent: 2, days: null, issueDate: ISSUE })).toBe(false);
  });
  it("accepts standard 2 % / 7 days", () => {
    expect(isSkontoActive({ totalCent: 10000, percent: 2, days: 7, issueDate: ISSUE })).toBe(true);
  });
});

describe("computeSkonto", () => {
  it("returns null when inactive", () => {
    expect(computeSkonto({ totalCent: 10000, percent: 0, days: 7, issueDate: ISSUE })).toBeNull();
  });

  it("calculates 2 % of 100,00 € = 2,00 €", () => {
    const r = computeSkonto({ totalCent: 10000, percent: 2, days: 7, issueDate: ISSUE });
    expect(r).not.toBeNull();
    expect(r!.discountCent).toBe(200);
  });

  it("calculates 3 % of 5.950,00 € = 178,50 €", () => {
    const r = computeSkonto({ totalCent: 595000, percent: 3, days: 14, issueDate: ISSUE });
    expect(r!.discountCent).toBe(17850);
  });

  it("floors to whole cents", () => {
    // 2 % von 99,99 € = 1,9998 € → 199 Cent (nicht 200)
    const r = computeSkonto({ totalCent: 9999, percent: 2, days: 7, issueDate: ISSUE });
    expect(r!.discountCent).toBe(199);
  });

  it("computes deadline = issueDate + days * 86400", () => {
    const r = computeSkonto({ totalCent: 10000, percent: 2, days: 7, issueDate: ISSUE });
    expect(r!.deadlineUnix).toBe(ISSUE + 7 * 86400);
  });
});

describe("formatSkontoLineDe", () => {
  it("produces the expected German line", () => {
    const r = {
      discountCent: 17850,
      deadlineUnix: ISSUE + 7 * 86400,
      percent: 3,
      days: 7,
    };
    const line = formatSkontoLineDe(
      r,
      (c) => `${(c / 100).toFixed(2).replace(".", ",")} €`,
      (u) => new Date(u * 1000).toISOString().slice(0, 10),
    );
    expect(line).toContain("3 % Skonto");
    expect(line).toContain("178,50 €");
  });
});
