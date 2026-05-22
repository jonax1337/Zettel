import { describe, expect, it } from "vitest";
import { addDaysUnix, formatDate, fromIsoDate, nowUnix, toIsoDate } from "./date";

describe("toIsoDate / fromIsoDate", () => {
  it("roundtrips at local midnight", () => {
    const iso = "2026-05-22";
    expect(toIsoDate(fromIsoDate(iso))).toBe(iso);
  });
  it("zero-pads month and day", () => {
    const iso = toIsoDate(fromIsoDate("2026-01-05"));
    expect(iso).toBe("2026-01-05");
  });
  it("handles end-of-year boundary", () => {
    expect(toIsoDate(fromIsoDate("2025-12-31"))).toBe("2025-12-31");
  });
  it("handles leap day", () => {
    expect(toIsoDate(fromIsoDate("2024-02-29"))).toBe("2024-02-29");
  });
});

describe("fromIsoDate", () => {
  it("falls back to month/day 1 on partial input", () => {
    expect(fromIsoDate("2026")).toBe(fromIsoDate("2026-01-01"));
  });
});

describe("formatDate", () => {
  it("formats as DD.MM.YYYY (de-DE)", () => {
    const u = fromIsoDate("2026-05-22");
    expect(formatDate(u)).toBe("22.5.2026");
  });
});

describe("addDaysUnix", () => {
  it("adds positive days", () => {
    const base = fromIsoDate("2026-05-20");
    expect(toIsoDate(addDaysUnix(base, 7))).toBe("2026-05-27");
  });
  it("subtracts when negative", () => {
    const base = fromIsoDate("2026-05-01");
    expect(toIsoDate(addDaysUnix(base, -1))).toBe("2026-04-30");
  });
  it("crosses DST boundary cleanly (Berlin)", () => {
    // 2026-03-29 02:00 → 03:00 CEST. addDaysUnix is pure-second math, so the
    // ISO output can shift by 1h, but the date string at local midnight stays
    // stable thanks to fromIsoDate using local-time constructor.
    const base = fromIsoDate("2026-03-28");
    const plus2 = addDaysUnix(base, 2);
    expect(toIsoDate(plus2)).toBe("2026-03-30");
  });
});

describe("nowUnix", () => {
  it("returns a sane current epoch (seconds since 1970)", () => {
    const n = nowUnix();
    // some safe lower bound (year 2026) and reasonable upper bound (year 2100)
    expect(n).toBeGreaterThan(1_750_000_000);
    expect(n).toBeLessThan(4_000_000_000);
  });
  it("returns integer seconds", () => {
    expect(Number.isInteger(nowUnix())).toBe(true);
  });
});
