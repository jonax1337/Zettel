import { describe, expect, it } from "vitest";
import type { TimeEntryListRow } from "$lib/db/time-entries";
import { emptyEntryForm, entryInputFromForm, formFromEntry, timeRangeText, type EntryFormValues } from "./entry-form";

const at = (h: number, m: number) => new Date(2026, 4, 5, h, m).getTime() / 1000;
const midnight = at(0, 0);

function form(overrides: Partial<EntryFormValues> = {}): EntryFormValues {
  return { ...emptyEntryForm("7", "2026-05-05"), ...overrides };
}

describe("entryInputFromForm", () => {
  it("turns a clock range into start and end on the entry day", () => {
    const input = entryInputFromForm(form({ mode: "range", start: "9:15", end: "10:45", description: "Konzept" }));

    expect(input).toEqual({
      projectId: 7,
      entryDate: midnight,
      description: "Konzept",
      timing: { mode: "range", startedAt: at(9, 15), endedAt: at(10, 45) },
    });
  });

  it.each([
    ["1:30", 90],
    ["1,5", 90],
    ["1.5", 90],
    ["2", 120],
  ])("reads the duration %s as %i minutes", (text, minutes) => {
    expect(entryInputFromForm(form({ mode: "duration", duration: text })).timing).toEqual({
      mode: "duration",
      durationMinutes: minutes,
    });
  });

  it("asks for a project and a date", () => {
    expect(() => entryInputFromForm(form({ projectId: "" }))).toThrow("Projekt");
    expect(() => entryInputFromForm(form({ date: "" }))).toThrow("Datum");
  });

  it("explains an unreadable duration", () => {
    expect(() => entryInputFromForm(form({ mode: "duration", duration: "abc" }))).toThrow("1:30 oder 1,5");
  });

  it.each(["", "9", "25:00", "9:60", "9:5x"])("explains the unreadable clock time %j", (text) => {
    expect(() => entryInputFromForm(form({ mode: "range", start: text, end: "10:00" }))).toThrow("hh:mm");
    expect(() => entryInputFromForm(form({ mode: "range", start: "08:00", end: text }))).toThrow("hh:mm");
  });
});

describe("formFromEntry", () => {
  const row = {
    projectId: 3,
    entryDate: midnight,
    startedAt: at(9, 5),
    endedAt: at(10, 0),
    durationMinutes: 55,
    description: "Review",
  } as TimeEntryListRow;

  it("shows a clocked entry as a range", () => {
    expect(formFromEntry(row)).toMatchObject({
      projectId: "3",
      date: "2026-05-05",
      mode: "range",
      start: "09:05",
      end: "10:00",
      description: "Review",
    });
  });

  it("shows an entry without clock times as its duration", () => {
    expect(formFromEntry({ ...row, startedAt: null, endedAt: null })).toMatchObject({
      mode: "duration",
      duration: "0:55",
    });
  });

  it("round-trips through the input conversion", () => {
    expect(entryInputFromForm(formFromEntry(row))).toMatchObject({
      timing: { mode: "range", startedAt: row.startedAt, endedAt: row.endedAt },
    });
  });
});

describe("timeRangeText", () => {
  it("shows the clock range of a finished entry", () => {
    expect(timeRangeText({ startedAt: at(9, 5), endedAt: at(10, 0) })).toBe("09:05–10:00");
  });

  it("shows only the start of a running timer", () => {
    expect(timeRangeText({ startedAt: at(9, 5), endedAt: null })).toBe("ab 09:05");
  });

  it("has no times for a plain duration", () => {
    expect(timeRangeText({ startedAt: null, endedAt: null })).toBeNull();
  });
});
