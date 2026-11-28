import { describe, expect, it } from "vitest";
import type { EuerLine } from "$lib/reports/euer";
import { isEmptyEuerLine, splitEuerSections } from "./euer-sections";

function line(kz: string, overrides: Partial<EuerLine> = {}): EuerLine {
  return { kz, line: "1", label: kz, kind: "expense", amountCent: null, ...overrides };
}

describe("splitEuerSections", () => {
  it("puts the income sum last in the income block", () => {
    const lines = [line("112", { kind: "income" }), line("159", { kind: "sum" }), line("100"), line("199", { kind: "sum" })];
    const [income, expenses] = splitEuerSections(lines);
    expect(income.lines.map((l) => l.kz)).toEqual(["112", "159"]);
    expect(expenses.lines.map((l) => l.kz)).toEqual(["100", "199"]);
  });
});

describe("isEmptyEuerLine", () => {
  it("is true for a plain line without amount", () => {
    expect(isEmptyEuerLine(line("100"))).toBe(true);
  });

  it("is false once the line has an amount, also zero", () => {
    expect(isEmptyEuerLine(line("100", { amountCent: 0 }))).toBe(false);
  });

  it("keeps sums and hinted lines visible", () => {
    expect(isEmptyEuerLine(line("159", { kind: "sum" }))).toBe(false);
    expect(isEmptyEuerLine(line("186", { hint: "selbst ergänzen" }))).toBe(false);
  });
});
