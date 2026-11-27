import { afterEach, describe, expect, it, vi } from "vitest";
import {
  comparisonPeriod,
  isRunning,
  loadDefaultPeriod,
  monthKey,
  monthsIn,
  oneYearEarlier,
  periodCustom,
  periodForMonth,
  periodForQuarter,
  periodForYear,
  saveDefaultPeriod,
} from "./period";
import { SECONDS_PER_DAY, toUnix } from "$lib/utils/date";

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

describe("oneYearEarlier", () => {
  const at = (year: number, month: number, day: number, hour = 0) => toUnix(new Date(year, month - 1, day, hour));

  it("shifts a year and keeps its label format", () => {
    expect(oneYearEarlier(periodForYear(2026))).toEqual(periodForYear(2025));
  });

  it("shifts a quarter and a month to the same span of the previous year", () => {
    expect(oneYearEarlier(periodForQuarter(2026, 2))).toEqual(periodForQuarter(2025, 2));
    expect(oneYearEarlier(periodForMonth(2026, 5))).toEqual(periodForMonth(2025, 5));
  });

  it("shifts a custom period by calendar year, not by 365 days", () => {
    const earlier = oneYearEarlier(periodCustom(at(2025, 3, 1), at(2025, 4, 1)));

    expect([earlier.start, earlier.end]).toEqual([at(2024, 3, 1), at(2024, 4, 1)]);
  });

  it("lands a Feb 29 start on Feb 28 of a year without one", () => {
    const earlier = oneYearEarlier(periodCustom(at(2024, 2, 29), at(2024, 3, 10)));

    expect(earlier.start).toBe(at(2023, 2, 28));
  });

  it("keeps 28 Feb in the earlier span when the period ends after 28 Feb of a leap year", () => {
    // 1.-28. Feb 2024 has the exclusive end 29.02.; its comparison must include 28.02.2023.
    const earlier = oneYearEarlier(periodCustom(at(2024, 2, 1), at(2024, 2, 29)));

    expect([earlier.start, earlier.end]).toEqual([at(2023, 2, 1), at(2023, 3, 1)]);
  });

  it("keeps month i of the result aligned with month i of the period", () => {
    const p = periodCustom(at(2025, 11, 10), at(2026, 2, 20));

    expect(monthsIn(oneYearEarlier(p)).map((m) => m.month)).toEqual(monthsIn(p).map((m) => m.month));
  });
});

describe("comparisonPeriod", () => {
  const at = (year: number, month: number, day: number, hour = 0) => toUnix(new Date(year, month - 1, day, hour));

  it("compares a finished period with the whole span one year earlier", () => {
    expect(comparisonPeriod(periodForYear(2025), at(2026, 6, 1))).toEqual(periodForYear(2024));
  });

  it("stops a running period at the same day one year earlier, today included", () => {
    const compared = comparisonPeriod(periodForYear(2026), at(2026, 11, 27, 15));

    expect(compared.start).toBe(at(2025, 1, 1));
    expect(compared.end).toBe(at(2025, 11, 28));
  });

  it("includes 28 Feb of the previous year when today is 28 Feb of a leap year", () => {
    const compared = comparisonPeriod(periodForYear(2028), at(2028, 2, 28, 15));

    expect(compared.end).toBe(at(2027, 3, 1));
  });

  it("does not stop a period that has not started yet", () => {
    expect(comparisonPeriod(periodForYear(2027), at(2026, 11, 27))).toEqual(periodForYear(2026));
  });
});

describe("isRunning and monthKey", () => {
  it("includes the start and excludes the end", () => {
    const p = periodForMonth(2026, 5);

    expect([isRunning(p, p.start), isRunning(p, p.end - 1), isRunning(p, p.end)]).toEqual([true, true, false]);
  });

  it("writes keys like SQLite's %Y-%m", () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(monthKey({ year: 2026, month: 12 })).toBe("2026-12");
  });
});
