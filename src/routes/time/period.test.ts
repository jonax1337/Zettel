import { describe, expect, it } from "vitest";
import { periodContaining, periodTotalLabel, shiftPeriod } from "./period";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 30);
const unix = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;

describe("week", () => {
  it("runs from Monday to the next Monday, exclusive", () => {
    const week = periodContaining("week", at(2026, 5, 6));

    expect(week.start).toBe(unix(2026, 5, 4));
    expect(week.end).toBe(unix(2026, 5, 11));
  });

  it("counts a Sunday to the week that began the Monday before", () => {
    expect(periodContaining("week", at(2026, 5, 10)).start).toBe(unix(2026, 5, 4));
    expect(periodContaining("week", at(2026, 5, 11)).start).toBe(unix(2026, 5, 11));
  });

  it("is labelled with its ISO calendar week and its days", () => {
    expect(periodContaining("week", at(2026, 5, 6)).label).toBe("KW 19 · 4.5.2026 – 10.5.2026");
  });

  it("belongs to the ISO year of its Thursday around New Year", () => {
    const week = periodContaining("week", at(2027, 1, 1));

    expect(week.label).toBe("KW 53 · 28.12.2026 – 3.1.2027");
    expect(week.start).toBe(unix(2026, 12, 28));
  });

  it("steps by seven days across a daylight saving change", () => {
    const beforeSwitch = periodContaining("week", at(2026, 3, 25));
    const next = shiftPeriod(beforeSwitch, 1);

    expect(next.start).toBe(unix(2026, 3, 30));
    expect(next.end).toBe(unix(2026, 4, 6));
    expect(shiftPeriod(next, -1)).toEqual(beforeSwitch);
  });
});

describe("month", () => {
  it("covers the calendar month, end exclusive", () => {
    const month = periodContaining("month", at(2026, 2, 17));

    expect(month).toMatchObject({ unit: "month", start: unix(2026, 2, 1), end: unix(2026, 3, 1), label: "Februar 2026" });
  });

  it("steps over a year boundary in both directions", () => {
    const december = periodContaining("month", at(2026, 12, 31));

    expect(shiftPeriod(december, 1).label).toBe("Januar 2027");
    expect(shiftPeriod(periodContaining("month", at(2026, 1, 1)), -1).label).toBe("Dezember 2025");
  });
});

describe("periodTotalLabel", () => {
  it("calls the current period this week or month", () => {
    expect(periodTotalLabel(periodContaining("week", at(2026, 5, 6)), at(2026, 5, 8))).toBe("Diese Woche");
    expect(periodTotalLabel(periodContaining("month", at(2026, 5, 6)), at(2026, 5, 30))).toBe("Dieser Monat");
  });

  it("names any other period by its unit", () => {
    expect(periodTotalLabel(periodContaining("week", at(2026, 5, 6)), at(2026, 6, 8))).toBe("Woche gesamt");
    expect(periodTotalLabel(periodContaining("month", at(2026, 5, 6)), at(2026, 6, 8))).toBe("Monat gesamt");
  });
});
