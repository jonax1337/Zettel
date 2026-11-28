import type { StatusTable } from "$lib/ui";

export type EntryStatus = "open" | "billed" | "running";

export const ENTRY_STATUS: StatusTable<EntryStatus> = {
  open: { label: "offen", variant: "open" },
  billed: { label: "abgerechnet", variant: "paid" },
  running: { label: "läuft", variant: "calm" },
};

/** An entry on an invoice is billed, whatever its duration; a running timer is not on one yet. */
export function entryStatus(entry: { invoiceId: number | null; durationMinutes: number | null }): EntryStatus {
  if (entry.invoiceId !== null) return "billed";
  return entry.durationMinutes === null ? "running" : "open";
}
