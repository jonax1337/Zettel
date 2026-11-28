import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it.each([
    ["Nordlicht Bäckerei GmbH", "NB"],
    ["Kanzlei Berger & Partner", "KB"],
    ["Figma", "F"],
    ["& Söhne Bau", "SB"],
    ["ärzte ohne Grenzen", "ÄO"],
    ["3M Deutschland", "3D"],
    ["  ", ""],
  ])("%j gives %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
