export type PeriodType = "year" | "quarter" | "month" | "custom";

export type Period = {
  type: PeriodType;
  /** Unix seconds, inclusive */
  start: number;
  /** Unix seconds, exclusive */
  end: number;
  /** Human label like "2026", "Q2 2026", "Mai 2026" */
  label: string;
};

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function unix(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export function periodForYear(year: number): Period {
  return {
    type: "year",
    start: unix(new Date(year, 0, 1)),
    end: unix(new Date(year + 1, 0, 1)),
    label: String(year),
  };
}

export function periodForQuarter(year: number, quarter: 1 | 2 | 3 | 4): Period {
  const startMonth = (quarter - 1) * 3;
  return {
    type: "quarter",
    start: unix(new Date(year, startMonth, 1)),
    end: unix(new Date(year, startMonth + 3, 1)),
    label: `Q${quarter} ${year}`,
  };
}

export function periodForMonth(year: number, month: number): Period {
  return {
    type: "month",
    start: unix(new Date(year, month - 1, 1)),
    end: unix(new Date(year, month, 1)),
    label: `${MONTHS_DE[month - 1]} ${year}`,
  };
}

export function periodCustom(startUnix: number, endUnixExclusive: number): Period {
  const s = new Date(startUnix * 1000);
  const e = new Date((endUnixExclusive - 1) * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("de-DE");
  return {
    type: "custom",
    start: startUnix,
    end: endUnixExclusive,
    label: `${fmt(s)} – ${fmt(e)}`,
  };
}

export function currentDefaultPeriod(): Period {
  const now = new Date();
  return periodForYear(now.getFullYear());
}

// --- Persistence (localStorage; settings table is fixed-schema singleton) ---

const STORAGE_KEY = "dashboard_period_default";

type StoredPeriod = {
  type: PeriodType;
  year?: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: number;
  start?: number;
  end?: number;
};

export function loadDefaultPeriod(): Period {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return currentDefaultPeriod();
    const s = JSON.parse(raw) as StoredPeriod;
    const now = new Date();
    if (s.type === "year") return periodForYear(s.year ?? now.getFullYear());
    if (s.type === "quarter")
      return periodForQuarter(
        s.year ?? now.getFullYear(),
        (s.quarter ?? 1) as 1 | 2 | 3 | 4,
      );
    if (s.type === "month")
      return periodForMonth(s.year ?? now.getFullYear(), s.month ?? now.getMonth() + 1);
    if (s.type === "custom" && s.start && s.end) return periodCustom(s.start, s.end);
  } catch {
    // fall through
  }
  return currentDefaultPeriod();
}

export function saveDefaultPeriod(p: Period): void {
  const now = new Date(p.start * 1000);
  const stored: StoredPeriod =
    p.type === "year"
      ? { type: "year", year: now.getFullYear() }
      : p.type === "quarter"
        ? {
            type: "quarter",
            year: now.getFullYear(),
            quarter: (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
          }
        : p.type === "month"
          ? { type: "month", year: now.getFullYear(), month: now.getMonth() + 1 }
          : { type: "custom", start: p.start, end: p.end };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

/** Iterate months inside a period for monthly aggregation. */
export function monthsIn(p: Period): { year: number; month: number; start: number; end: number; label: string }[] {
  const out: { year: number; month: number; start: number; end: number; label: string }[] = [];
  const short = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  let cur = new Date(p.start * 1000);
  cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const endDate = new Date(p.end * 1000);
  while (cur < endDate) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    out.push({
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      start: unix(cur),
      end: unix(next),
      label: short[cur.getMonth()],
    });
    cur = next;
    if (out.length > 120) break;
  }
  return out;
}
