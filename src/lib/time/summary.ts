import type { TimeEntryListRow } from "$lib/db/time-entries";
import { previewBilling, type BillableEntry } from "./billing";

/** The entry as billing sees it; null for a running timer, which has no duration yet. */
export function toBillableEntry(row: TimeEntryListRow): BillableEntry | null {
  if (row.durationMinutes === null) return null;
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    hourlyRateCent: row.hourlyRateCent,
    entryDate: row.entryDate,
    description: row.description,
    durationMinutes: row.durationMinutes,
  };
}

export type TimeSummary = {
  totalMinutes: number;
  openMinutes: number;
  billedMinutes: number;
  /** Net amount of the open entries at exact minutes, one position per project. */
  openAmountCent: number;
};

/** Sums finished entries; a running timer is not counted until it is stopped. */
export function summarizeEntries(rows: TimeEntryListRow[]): TimeSummary {
  const finished = rows.flatMap((row) => toBillableEntry(row) ?? []);
  const open = rows.filter((row) => row.invoiceId === null).flatMap((row) => toBillableEntry(row) ?? []);
  const minutesOf = (entries: BillableEntry[]) => entries.reduce((sum, e) => sum + e.durationMinutes, 0);
  const openMinutes = minutesOf(open);
  return {
    totalMinutes: minutesOf(finished),
    openMinutes,
    billedMinutes: minutesOf(finished) - openMinutes,
    openAmountCent: previewBilling(open, { grouping: "perProject", incrementMinutes: 1, vatRate: 0 }).subtotalCent,
  };
}
