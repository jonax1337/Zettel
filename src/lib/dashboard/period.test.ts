import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadDefaultPeriod,
  monthsIn,
  periodCustom,
  periodForMonth,
  periodForQuarter,
  periodForYear,
  saveDefaultPeriod,
} from "./period";
import { SECONDS_PER_DAY } from "$lib/utils/date";

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("period constructors", () => {
  it("builds half-open ranges that tile without gaps", () => {
    const q1 = periodForQuarter(2026, 1);
    const q2 = periodForQuarter(2026, 2);
    expect(q1.end).toBe(q2.start);
    expect(periodForYear(2026).start).toBe(q1.start);
    expect(periodForQuarter(2026, 4).end).toBe(periodForYear(2026).end);
  });

  it("labels periods in German", () => {
    expect(periodForYear(2026).label).toBe("2026");
    expect(periodForQuarter(2026, 2).label).toBe("Q2 2026");
    expect(periodForMonth(2026, 5).label).toBe("Mai 2026");
  });

  it("labels a custom period with its last included day", () => {
    const p = periodCustom(periodForMonth(2026, 3).start, periodForMonth(2026, 4).start);
    expect(p.label).toBe(`${new Date(2026, 2, 1).toLocaleDateString("de-DE")} – ${new Date(2026, 2, 31).toLocaleDateString("de-DE")}`);
  });
});

describe("monthsIn", () => {
  it("lists the three months of a quarter with short labels", () => {
    const months = monthsIn(periodForQuarter(2026, 2));
    expect(months.map((m) => [m.month, m.label])).toEqual([
      [4, "Apr"],
      [5, "Mai"],
      [6, "Jun"],
    ]);
    expect(months[0].end).toBe(months[1].start);
  });

  it("includes the month a custom period ends in", () => {
    const p = periodCustom(periodForMonth(2026, 1).start + SECONDS_PER_DAY * 10, periodForMonth(2026, 3).start + SECONDS_PER_DAY * 5);
    expect(monthsIn(p).map((m) => m.month)).toEqual([1, 2, 3]);
  });
});

describe("default period persistence", () => {
  it("round-trips a quarter", () => {
    stubLocalStorage();
    saveDefaultPeriod(periodForQuarter(2025, 3));
    expect(loadDefaultPeriod()).toEqual(periodForQuarter(2025, 3));
  });

  it("round-trips a custom period", () => {
    stubLocalStorage();
    const custom = periodCustom(1_700_000_000, 1_710_000_000);
    saveDefaultPeriod(custom);
    expect(loadDefaultPeriod()).toEqual(custom);
  });

  it("falls back to the current year on corrupt JSON", () => {
    stubLocalStorage({ dashboard_period_default: "{not json" });
    expect(loadDefaultPeriod().type).toBe("year");
  });

  it("falls back to the current year when storage is unavailable", () => {
    expect(loadDefaultPeriod().type).toBe("year");
  });
});
