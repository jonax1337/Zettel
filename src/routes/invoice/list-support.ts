import type { StatusTable } from "$lib/ui/status-meta";
import { SECONDS_PER_DAY } from "$lib/utils/date";

export const ALL = "all";

/**
 * Hides a table column below the window width where the sidebar and the table no longer
 * fit side by side. A viewport variant on purpose: the page container is far wider than
 * the 1181px breakpoint at which the layout tightens.
 */
export const WIDE_ONLY = "max-[1180px]:hidden";

type FilterItem<V extends string> = { value: V; label: string };

/** A status filter with more options than this does not fit beside the search field as a segmented control. */
const MAX_SEGMENTED_STATUSES = 4;

/** True when the status filter is short enough for a segmented control; `items` includes the catch-all. */
export function fitsSegmentedStatus(items: FilterItem<string>[]): boolean {
  return items.length - 1 <= MAX_SEGMENTED_STATUSES;
}

/** The catch-all of a segmented control reads "Alle"; "Alle Status" is for the select. */
export function segmentedStatusItems<S extends string>(items: FilterItem<S>[]): FilterItem<S>[] {
  return items.map((item) => (item.value === ALL ? { ...item, label: "Alle" } : item));
}

export function statusFilterItems<S extends string>(
  table: StatusTable<S>,
  order: S[] = Object.keys(table) as S[],
): FilterItem<S | typeof ALL>[] {
  return [
    { value: ALL, label: "Alle Status" },
    ...order.map((value) => ({ value, label: table[value].label })),
  ];
}

export function yearFilterItems(years: number[]): FilterItem<string>[] {
  return [{ value: ALL, label: "Alle Jahre" }, ...years.map((y) => ({ value: String(y), label: String(y) }))];
}

export function customerFilterItems(
  customers: { id: number; name: string }[],
  allLabel = "Alle Kunden",
): FilterItem<string>[] {
  return [{ value: ALL, label: allLabel }, ...customers.map((c) => ({ value: String(c.id), label: c.name }))];
}

export function numberOrAll(value: string): number | typeof ALL {
  return value === ALL ? ALL : Number.parseInt(value, 10);
}

/** Whole days since the due date; 0 while the invoice has been overdue for less than a day. */
export function overdueDays(dueDate: number, now: number): number {
  return Math.max(0, Math.floor((now - dueDate) / SECONDS_PER_DAY));
}

export function overdueLabel(days: number): string {
  if (days <= 0) return "Überfällig";
  return days === 1 ? "1 Tag überfällig" : `${days} Tage überfällig`;
}

/** Fits "Überfällig seit …" in the reminder overview. */
export function overdueSinceLabel(days: number): string {
  if (days <= 0) return "heute";
  return days === 1 ? "1 Tag" : `${days} Tagen`;
}
