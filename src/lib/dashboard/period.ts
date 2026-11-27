import { addDaysUnix, MONTHS_DE, MONTHS_DE_SHORT, startOfDayUnix, toUnix } from "$lib/utils/date";

export type PeriodType = "year" | "quarter" | "month" | "custom";

export type Quarter = 1 | 2 | 3 | 4;

export type Period = {
  type: PeriodType;
  /** Unix seconds, inclusive */
  start: number;
  /** Unix seconds, exclusive */
  end: number;
  /** Human label like "2026", "Q2 2026", "Mai 2026" */
  label: string;
};

export type MonthSlice = {
  year: number;
  month: number;
  start: number;
  end: number;
  label: string;
};

const MONTHS_PER_QUARTER = 3;

/** Guards `monthsIn` against runaway custom periods. */
const MAX_MONTHS_IN_PERIOD = 120;

export function periodForYear(year: number): Period {
  return {
    type: "year",
    start: toUnix(new Date(year, 0, 1)),
    end: toUnix(new Date(year + 1, 0, 1)),
    label: String(year),
  };
}

export function periodForQuarter(year: number, quarter: Quarter): Period {
  const startMonth = (quarter - 1) * MONTHS_PER_QUARTER;
  return {
    type: "quarter",
    start: toUnix(new Date(year, startMonth, 1)),
    end: toUnix(new Date(year, startMonth + MONTHS_PER_QUARTER, 1)),
    label: `Q${quarter} ${year}`,
  };
}

export function periodForMonth(year: number, month: number): Period {
  return {
    type: "month",
    start: toUnix(new Date(year, month - 1, 1)),
    end: toUnix(new Date(year, month, 1)),
    label: `${MONTHS_DE[month - 1]} ${year}`,
  };
}

export function periodCustom(startUnix: number, endUnixExclusive: number): Period {
  const first = new Date(startUnix * 1000);
  const last = new Date((endUnixExclusive - 1) * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("de-DE");
  return {
    type: "custom",
    start: startUnix,
    end: endUnixExclusive,
    label: `${fmt(first)} – ${fmt(last)}`,
  };
}

function currentDefaultPeriod(): Period {
  return periodForYear(new Date().getFullYear());
}

// --- Persistence (localStorage; settings table is fixed-schema singleton) ---

const STORAGE_KEY = "dashboard_period_default";

type StoredPeriod = {
  type: PeriodType;
  year?: number;
  quarter?: Quarter;
  month?: number;
  start?: number;
  end?: number;
};

function periodFromStored(stored: StoredPeriod, now: Date): Period | null {
  const year = stored.year ?? now.getFullYear();
  switch (stored.type) {
    case "year":
      return periodForYear(year);
    case "quarter":
      return periodForQuarter(year, stored.quarter ?? 1);
    case "month":
      return periodForMonth(year, stored.month ?? now.getMonth() + 1);
    case "custom":
      return stored.start && stored.end ? periodCustom(stored.start, stored.end) : null;
  }
}

function storedFromPeriod(p: Period): StoredPeriod {
  const first = new Date(p.start * 1000);
  const year = first.getFullYear();
  switch (p.type) {
    case "year":
      return { type: "year", year };
    case "quarter":
      return {
        type: "quarter",
        year,
        quarter: (Math.floor(first.getMonth() / MONTHS_PER_QUARTER) + 1) as Quarter,
      };
    case "month":
      return { type: "month", year, month: first.getMonth() + 1 };
    case "custom":
      return { type: "custom", start: p.start, end: p.end };
  }
}

/** Falls back to the current year when storage is unavailable or holds garbage. */
export function loadDefaultPeriod(): Period {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const period = periodFromStored(JSON.parse(raw) as StoredPeriod, new Date());
      if (period) return period;
    }
  } catch {
    // Storage blocked or JSON corrupt: the default below is the documented fallback.
  }
  return currentDefaultPeriod();
}

export function saveDefaultPeriod(p: Period): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedFromPeriod(p)));
  } catch {
    // Storage blocked: the choice just doesn't persist across sessions.
  }
}

/** The key under which SQL `strftime('%Y-%m', …)` reports a month. */
export function monthKey(m: Pick<MonthSlice, "year" | "month">): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

/** A Feb 29 lands on Feb 28 in a year without one. */
function oneYearBefore(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  const year = d.getFullYear() - 1;
  const lastDayOfMonth = new Date(year, d.getMonth() + 1, 0).getDate();
  return toUnix(
    new Date(year, d.getMonth(), Math.min(d.getDate(), lastDayOfMonth), d.getHours(), d.getMinutes(), d.getSeconds()),
  );
}

/**
 * The exclusive end one year earlier. It follows the last included day, not the
 * end itself: an end of 29 Feb would otherwise cut 28 Feb off the earlier span.
 */
function exclusiveEndOneYearBefore(exclusiveEnd: number): number {
  return addDaysUnix(oneYearBefore(addDaysUnix(exclusiveEnd, -1)), 1);
}

function periodSpan(type: PeriodType, start: number, end: number): Period {
  const first = new Date(start * 1000);
  switch (type) {
    case "year":
      return periodForYear(first.getFullYear());
    case "quarter":
      return periodForQuarter(first.getFullYear(), (Math.floor(first.getMonth() / MONTHS_PER_QUARTER) + 1) as Quarter);
    case "month":
      return periodForMonth(first.getFullYear(), first.getMonth() + 1);
    case "custom":
      return periodCustom(start, end);
  }
}

/** The same calendar span one year earlier, so month i of the result is month i of `p`. */
export function oneYearEarlier(p: Period): Period {
  return periodSpan(p.type, oneYearBefore(p.start), exclusiveEndOneYearBefore(p.end));
}

export function isRunning(p: Period, now: number): boolean {
  return p.start <= now && now < p.end;
}

/**
 * What to compare a period against: the same span one year earlier. While the
 * period is still running, only up to today's date, so a year-to-date figure is
 * not set against a whole year.
 */
export function comparisonPeriod(p: Period, now: number): Period {
  const earlier = oneYearEarlier(p);
  if (!isRunning(p, now)) return earlier;
  const tomorrow = addDaysUnix(startOfDayUnix(new Date(now * 1000)), 1);
  return { ...earlier, end: exclusiveEndOneYearBefore(tomorrow) };
}

/** Iterate months inside a period for monthly aggregation. */
export function monthsIn(p: Period): MonthSlice[] {
  const months: MonthSlice[] = [];
  const periodEnd = new Date(p.end * 1000);
  const periodStart = new Date(p.start * 1000);
  let cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
  while (cursor < periodEnd && months.length < MAX_MONTHS_IN_PERIOD) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    months.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1,
      start: toUnix(cursor),
      end: toUnix(next),
      label: MONTHS_DE_SHORT[cursor.getMonth()],
    });
    cursor = next;
  }
  return months;
}
