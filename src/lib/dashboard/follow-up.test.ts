import { describe, expect, it } from "vitest";
import { fromIsoDate } from "$lib/utils/date";
import { classifyFollowUp, followUpWindow } from "./follow-up";

describe("classifyFollowUp", () => {
  const now = new Date(2026, 4, 17, 15, 30);
  const window = followUpWindow(now);

  it("flags dates before today as overdue", () => {
    expect(classifyFollowUp(fromIsoDate("2026-05-16"), window)).toBe("overdue");
  });

  it("flags today's midnight as today", () => {
    expect(classifyFollowUp(fromIsoDate("2026-05-17"), window)).toBe("today");
  });

  it("flags tomorrow and later as week", () => {
    expect(classifyFollowUp(fromIsoDate("2026-05-18"), window)).toBe("week");
    expect(classifyFollowUp(fromIsoDate("2026-05-24"), window)).toBe("week");
  });

  it("ends the horizon after seven more days", () => {
    expect(window.horizonEnd).toBe(fromIsoDate("2026-05-25"));
  });

  it("keeps tomorrow out of today on the spring DST change (Berlin: 2026-03-29)", () => {
    const dstWindow = followUpWindow(new Date(2026, 2, 29, 10));
    expect(classifyFollowUp(fromIsoDate("2026-03-30"), dstWindow)).toBe("week");
    expect(classifyFollowUp(fromIsoDate("2026-03-29"), dstWindow)).toBe("today");
  });
});
