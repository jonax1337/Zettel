import { describe, expect, it } from "vitest";
import { parseHourlyRate } from "./project-form";

describe("parseHourlyRate", () => {
  it.each([
    ["95", 9_500],
    ["95,50", 9_550],
    ["1.234,50", 123_450],
    ["80 €", 8_000],
  ])("reads %j as %i cent", (text, cents) => {
    expect(parseHourlyRate(text)).toBe(cents);
  });

  it.each(["0", "0,00"])("accepts %j as a project without a rate", (text) => {
    expect(parseHourlyRate(text)).toBe(0);
  });

  it.each(["", "  ", "abc", "1.2.3", "-5"])("rejects %j", (text) => {
    expect(parseHourlyRate(text)).toBeNull();
  });
});
