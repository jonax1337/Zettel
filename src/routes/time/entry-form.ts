import type { TimeEntryInput, TimeEntryListRow } from "$lib/db/time-entries";
import { formatDuration, parseDuration } from "$lib/time/duration";
import { fromIsoDate, startOfDayUnix, toIsoDate } from "$lib/utils/date";

export type EntryMode = "range" | "duration";

/** What the entry dialog edits: all text, as typed. */
export type EntryFormValues = {
  projectId: string;
  /** ISO date of the work day. */
  date: string;
  mode: EntryMode;
  /** Clock time "h:mm" in range mode. */
  start: string;
  end: string;
  /** "1:30" or decimal hours in duration mode. */
  duration: string;
  description: string;
};

const CLOCK_TIME = /^(\d{1,2}):(\d{2})$/;
const pad2 = (n: number) => String(n).padStart(2, "0");

export function emptyEntryForm(projectId: string, isoDate: string): EntryFormValues {
  return { projectId, date: isoDate, mode: "range", start: "", end: "", duration: "", description: "" };
}

/** Only a clock range within the entry's day can be edited as Von–Bis; a timer that ran past midnight shows its duration. */
function isRangeWithinDay(row: TimeEntryListRow): boolean {
  return row.startedAt !== null && row.endedAt !== null && startOfDayUnix(new Date(row.endedAt * 1000)) === row.entryDate;
}

export function formFromEntry(row: TimeEntryListRow): EntryFormValues {
  return {
    projectId: String(row.projectId),
    date: toIsoDate(row.entryDate),
    mode: isRangeWithinDay(row) ? "range" : "duration",
    start: row.startedAt === null ? "" : clockText(row.startedAt),
    end: row.endedAt === null ? "" : clockText(row.endedAt),
    duration: row.durationMinutes === null ? "" : formatDuration(row.durationMinutes),
    description: row.description,
  };
}

function clockText(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "09:00–10:30" for a clocked entry, "ab 09:00" for a running timer, null for a plain duration. */
export function timeRangeText(row: Pick<TimeEntryListRow, "startedAt" | "endedAt">): string | null {
  if (row.startedAt === null) return null;
  return row.endedAt === null ? `ab ${clockText(row.startedAt)}` : `${clockText(row.startedAt)}–${clockText(row.endedAt)}`;
}

/** Unix seconds of `h:mm` on the given day, or null for text that is no clock time. */
function clockOnDay(isoDate: string, text: string): number | null {
  const match = CLOCK_TIME.exec(text.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  if (hours > 23 || minutes > 59) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime() / 1000;
}

const TIMING_FIELDS = ["date", "mode", "start", "end", "duration"] as const;

/** Whether the user left everything that determines the stored times and duration as the dialog showed it. */
function timingUntouched(values: EntryFormValues, original: TimeEntryListRow): boolean {
  const shown = formFromEntry(original);
  return TIMING_FIELDS.every((field) => values[field] === shown[field]);
}

/**
 * The entry to store; throws a German message for input the user has to fix.
 * `original` is the entry being edited: its stored timing survives an edit that
 * only touches project or description, because the form shows minutes only.
 */
export function entryInputFromForm(values: EntryFormValues, original: TimeEntryListRow | null = null): TimeEntryInput {
  if (values.projectId === "") throw new Error("Bitte ein Projekt wählen.");
  if (values.date === "") throw new Error("Bitte ein Datum wählen.");
  const base = {
    projectId: Number(values.projectId),
    entryDate: fromIsoDate(values.date),
    description: values.description,
  };
  if (original && original.durationMinutes !== null && timingUntouched(values, original)) {
    const { startedAt, endedAt, durationMinutes } = original;
    return { ...base, timing: { mode: "keep", startedAt, endedAt, durationMinutes } };
  }
  if (values.mode === "duration") {
    const durationMinutes = parseDuration(values.duration);
    if (durationMinutes === null) throw new Error("Bitte die Dauer als 1:30 oder 1,5 angeben.");
    return { ...base, timing: { mode: "duration", durationMinutes } };
  }
  const startedAt = clockOnDay(values.date, values.start);
  const endedAt = clockOnDay(values.date, values.end);
  if (startedAt === null || endedAt === null) throw new Error("Bitte Beginn und Ende als hh:mm angeben.");
  return { ...base, timing: { mode: "range", startedAt, endedAt } };
}
