import { describe, expect, it } from "vitest";
import { normalizeCountryCode } from "./country";

describe("normalizeCountryCode", () => {
  it("trims and upper-cases a two-letter code", () => {
    expect(normalizeCountryCode(" de ")).toBe("DE");
  });

  it("rejects empty, long, short and non-letter input", () => {
    for (const input of ["", "  ", null, undefined, "D", "DEU", "D1", "12"]) {
      expect(normalizeCountryCode(input)).toBeNull();
    }
  });
});
