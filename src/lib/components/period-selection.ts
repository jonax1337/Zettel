import {
  periodCustom,
  periodForMonth,
  periodForQuarter,
  periodForYear,
  type Period,
  type PeriodType,
  type Quarter,
} from "$lib/dashboard/period";
import { addDaysUnix, fromIsoDate } from "$lib/utils/date";

export type PeriodSelection = {
  type: PeriodType;
  year: number;
  quarter: Quarter;
  month: number;
  /** ISO date (YYYY-MM-DD) or empty string. */
  customFrom: string;
  /** Inclusive ISO date (YYYY-MM-DD) or empty string. */
  customTo: string;
};

/** The selected period, or null while a custom range is incomplete or ends before it starts. */
export function periodFromSelection(selection: PeriodSelection): Period | null {
  switch (selection.type) {
    case "year":
      return periodForYear(selection.year);
    case "quarter":
      return periodForQuarter(selection.year, selection.quarter);
    case "month":
      return periodForMonth(selection.year, selection.month);
    case "custom":
      return customPeriod(selection.customFrom, selection.customTo);
  }
}

function customPeriod(fromIso: string, toIso: string): Period | null {
  if (!fromIso || !toIso) return null;
  const start = fromIsoDate(fromIso);
  const endExclusive = addDaysUnix(fromIsoDate(toIso), 1);
  return endExclusive > start ? periodCustom(start, endExclusive) : null;
}
