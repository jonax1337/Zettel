import { describe, expect, it } from "vitest";
import { formatDuration, formatElapsed, formatHours, parseDuration } from "./duration";

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [90, "1:30"],
    [600, "10:00"],
    [1439, "23:59"],
  ])("%i minutes -> %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("formatElapsed", () => {
  it("shows hours, minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00:00");
    expect(formatElapsed(3725)).toBe("1:02:05");
  });

  it("never goes negative when the clock steps back", () => {
    expect(formatElapsed(-4)).toBe("0:00:00");
  });
});

describe("formatHours", () => {
  it.each([
    [0, "0,00"],
    [5, "0,05"],
    [150, "1,50"],
    [1234, "12,34"],
  ])("%i hundredths -> %s", (centiHours, expected) => {
    expect(formatHours(centiHours)).toBe(expected);
  });
});

describe("parseDuration", () => {
  it.each([
    ["1:30", 90],
    ["0:45", 45],
    ["12:05", 725],
    ["1,5", 90],
    ["1.5", 90],
    ["2", 120],
    ["0,25", 15],
    ["  1,5  ", 90],
    ["0,33", 20],
    ["0,01", 1],
  ])("reads %j as %i minutes", (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it.each(["", "abc", "1:60", "1:5:3", "-1", "1,", ",5", "1,5,5", "1h30"])("rejects %j", (text) => {
    expect(parseDuration(text)).toBeNull();
  });
});
