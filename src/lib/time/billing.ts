import { computeLineTotal } from "$lib/utils/totals";
import { formatDuration } from "./duration";

/**
 * Rounding of time entries into invoice positions.
 *
 * The quantity is hours, rounded half up to 0,01 Std (kaufmännisch) and
 * computed in integers: `centiHours = floor((minutes * 100 + 30) / 60)`. The
 * amount is `quantity * hourly rate` through `computeLineTotal`, the same
 * math the invoice applies when it is saved, so preview and invoice agree to
 * the cent. A billing increment (Takt) rounds the minutes of a position up
 * before the conversion.
 */

/** UN/ECE HUR in the ZUGFeRD mapping of the sidecar; the literal "HUR" would become C62. */
export const BILLING_UNIT = "Std";

export const BILLING_INCREMENTS = [1, 6, 15, 30] as const;
export type BillingIncrement = (typeof BILLING_INCREMENTS)[number];

export type BillingGrouping = "perProject" | "perEntry";

const MINUTES_PER_HOUR = 60;
const CENTI_PER_HOUR = 100;
const HALF_HOUR_IN_CENTI_MINUTES = 30;

export type BillableEntry = {
  id: number;
  projectId: number;
  projectName: string;
  hourlyRateCent: number;
  /** Local midnight of the work day. */
  entryDate: number;
  description: string;
  durationMinutes: number;
};

export type BillingOptions = {
  grouping: BillingGrouping;
  incrementMinutes: BillingIncrement;
  vatRate: number;
};

export type BillingLine = {
  description: string;
  longDescription: string | null;
  /** Hours with two decimals. */
  quantity: number;
  unit: typeof BILLING_UNIT;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  linePeriodStart: number;
  linePeriodEnd: number;
  /** Minutes after the increment was applied, i.e. what the quantity stands for. */
  billedMinutes: number;
  entryIds: number[];
};

export type BillingPreview = {
  lines: BillingLine[];
  /** Earliest and latest work day, or null without entries. */
  servicePeriodStart: number | null;
  servicePeriodEnd: number | null;
  subtotalCent: number;
};

/** Minutes as hundredths of an hour, half up. */
export function centiHoursOf(minutes: number): number {
  return Math.floor((minutes * CENTI_PER_HOUR + HALF_HOUR_IN_CENTI_MINUTES) / MINUTES_PER_HOUR);
}

export function roundUpToIncrement(minutes: number, incrementMinutes: BillingIncrement): number {
  return Math.ceil(minutes / incrementMinutes) * incrementMinutes;
}

const dayFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function entryLine(entry: BillableEntry): string {
  const when = `${dayFormat.format(new Date(entry.entryDate * 1000))} · ${formatDuration(entry.durationMinutes)}`;
  return entry.description === "" ? when : `${when} · ${entry.description}`;
}

function buildLine(
  entries: BillableEntry[],
  description: string,
  longDescription: string | null,
  options: BillingOptions,
): BillingLine {
  const billedMinutes = roundUpToIncrement(
    entries.reduce((sum, e) => sum + e.durationMinutes, 0),
    options.incrementMinutes,
  );
  const quantity = centiHoursOf(billedMinutes) / CENTI_PER_HOUR;
  const unitPrice = entries[0].hourlyRateCent;
  const days = entries.map((e) => e.entryDate);
  return {
    description,
    longDescription,
    quantity,
    unit: BILLING_UNIT,
    unitPrice,
    vatRate: options.vatRate,
    lineTotal: computeLineTotal({ quantity, unitPrice, vatRate: options.vatRate }),
    linePeriodStart: Math.min(...days),
    linePeriodEnd: Math.max(...days),
    billedMinutes,
    entryIds: entries.map((e) => e.id),
  };
}

function groupByProject(entries: BillableEntry[]): BillableEntry[][] {
  const groups = new Map<number, BillableEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.projectId);
    if (group) group.push(entry);
    else groups.set(entry.projectId, [entry]);
  }
  return [...groups.values()];
}

/**
 * The invoice positions the entries would become. Every entry must be finished;
 * the caller checks that and that all entries belong to one customer. Entries
 * of one project share its hourly rate.
 */
export function previewBilling(entries: BillableEntry[], options: BillingOptions): BillingPreview {
  const sorted = [...entries].sort((a, b) => a.entryDate - b.entryDate || a.id - b.id);
  const lines =
    options.grouping === "perProject"
      ? groupByProject(sorted).map((group) =>
          buildLine(group, group[0].projectName, group.map(entryLine).join("\n"), options),
        )
      : sorted.map((entry) => buildLine([entry], entry.description || entry.projectName, null, options));
  const days = sorted.map((e) => e.entryDate);
  return {
    lines,
    servicePeriodStart: days.length ? days[0] : null,
    servicePeriodEnd: days.length ? days[days.length - 1] : null,
    subtotalCent: lines.reduce((sum, line) => sum + line.lineTotal, 0),
  };
}
