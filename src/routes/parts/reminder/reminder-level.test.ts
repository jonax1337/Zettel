import { describe, expect, it, vi } from "vitest";
import {
  customerNameFromSnapshot,
  parseReminderLevel,
  suggestNextLevel,
  UNKNOWN_NAME,
} from "./reminder-level";

describe("suggestNextLevel", () => {
  it("starts with the first level", () => {
    expect(suggestNextLevel([])).toBe(1);
  });

  it("steps up one level above the highest existing reminder", () => {
    expect(suggestNextLevel([1])).toBe(2);
    expect(suggestNextLevel([2])).toBe(3);
    expect(suggestNextLevel([1, 2])).toBe(3);
  });

  it("stays on the last level once it was reached", () => {
    expect(suggestNextLevel([3])).toBe(3);
    expect(suggestNextLevel([1, 3])).toBe(3);
  });

  it("ignores the order of the existing levels", () => {
    expect(suggestNextLevel([2, 1])).toBe(3);
  });
});

describe("parseReminderLevel", () => {
  it("accepts the second and third level", () => {
    expect(parseReminderLevel("2")).toBe(2);
    expect(parseReminderLevel("3")).toBe(3);
  });

  it("falls back to the first level for missing or invalid input", () => {
    expect(parseReminderLevel(undefined)).toBe(1);
    expect(parseReminderLevel("7")).toBe(1);
    expect(parseReminderLevel("abc")).toBe(1);
  });
});

describe("customerNameFromSnapshot", () => {
  it("reads the name from the snapshot JSON", () => {
    expect(customerNameFromSnapshot('{"name":"Acme GmbH"}')).toBe("Acme GmbH");
  });

  it("shows a dash for a snapshot without a name", () => {
    expect(customerNameFromSnapshot("{}")).toBe(UNKNOWN_NAME);
  });

  it("shows a dash and warns for broken JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(customerNameFromSnapshot("not json")).toBe(UNKNOWN_NAME);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
