import { describe, expect, it } from "vitest";
import { EUER_CATEGORY_LINES, EUER_LINE_NUMBERS, EUER_LINES, formYearFor } from "./euer-form";

describe("EUER_LINE_NUMBERS", () => {
  it.each([2025, 2026])("has a line number for every Kennzahl in %i", (year) => {
    for (const { kz } of EUER_LINES) expect(EUER_LINE_NUMBERS[year][kz], kz).toBeTruthy();
  });

  it("lists every Kennzahl only once", () => {
    const kzs = EUER_LINES.map((line) => line.kz);
    expect(new Set(kzs).size).toBe(kzs.length);
  });

  it.each([
    ["100", "27", "29"],
    ["110", "29", "30"],
    ["185", "57", "58"],
    ["186", "58", "59"],
    ["199", "75", "76"],
    ["159", "23", "23"],
    ["130/131/136", "31–33", "32–34"],
  ])("puts Kz %s on line %s in 2025 and %s in 2026", (kz, line2025, line2026) => {
    expect(EUER_LINE_NUMBERS[2025][kz]).toBe(line2025);
    expect(EUER_LINE_NUMBERS[2026][kz]).toBe(line2026);
  });
});

describe("EUER_CATEGORY_LINES", () => {
  it("offers the expense lines a category can map to, including the fallback", () => {
    const kzs = EUER_CATEGORY_LINES.map((line) => line.kz);
    expect(kzs).toContain("183");
    expect(kzs).toContain("228");
    expect(kzs).not.toContain("185");
    expect(kzs).not.toContain("199");
    expect(kzs).not.toContain("112");
  });
});

describe("formYearFor", () => {
  it("uses the form of the tax year itself when it is known", () => {
    expect(formYearFor(2025)).toEqual({ year: 2025, exact: true });
    expect(formYearFor(2026)).toEqual({ year: 2026, exact: true });
  });

  it("falls back to the nearest known form and flags it", () => {
    expect(formYearFor(2027)).toEqual({ year: 2026, exact: false });
    expect(formYearFor(2024)).toEqual({ year: 2025, exact: false });
  });
});
