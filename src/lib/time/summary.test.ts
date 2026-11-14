import { describe, expect, it } from "vitest";
import type { TimeEntryListRow } from "$lib/db/time-entries";
import { summarizeEntries, toBillableEntry } from "./summary";

const day = new Date(2026, 4, 5).getTime() / 1000;

function row(overrides: Partial<TimeEntryListRow> & Pick<TimeEntryListRow, "id">): TimeEntryListRow {
  return {
    projectId: 1,
    entryDate: day,
    startedAt: null,
    endedAt: null,
    durationMinutes: 60,
    description: "",
    invoiceId: null,
    createdAt: 0,
    updatedAt: 0,
    projectName: "Website",
    hourlyRateCent: 9_000,
    customerId: 1,
    customerName: "Acme",
    invoiceNumber: null,
    invoiceStatus: null,
    invoiceReversed: false,
    ...overrides,
  };
}

describe("toBillableEntry", () => {
  it("has nothing to bill for a running timer", () => {
    expect(toBillableEntry(row({ id: 1, durationMinutes: null, startedAt: day }))).toBeNull();
  });

  it("carries what billing needs", () => {
    expect(toBillableEntry(row({ id: 3, description: "Konzept", durationMinutes: 45 }))).toEqual({
      id: 3,
      projectId: 1,
      projectName: "Website",
      hourlyRateCent: 9_000,
      entryDate: day,
      description: "Konzept",
      durationMinutes: 45,
    });
  });
});

describe("summarizeEntries", () => {
  it("splits finished minutes into open and billed and prices the open ones", () => {
    const summary = summarizeEntries([
      row({ id: 1, durationMinutes: 90 }),
      row({ id: 2, durationMinutes: 30, projectId: 2, projectName: "App", hourlyRateCent: 12_000 }),
      row({ id: 3, durationMinutes: 60, invoiceId: 5, invoiceStatus: "draft" }),
    ]);

    expect(summary).toEqual({
      totalMinutes: 180,
      openMinutes: 120,
      billedMinutes: 60,
      openAmountCent: 13_500 + 6_000,
    });
  });

  it("does not count a running timer", () => {
    const summary = summarizeEntries([row({ id: 1, durationMinutes: null, startedAt: day }), row({ id: 2, durationMinutes: 60 })]);

    expect(summary).toMatchObject({ totalMinutes: 60, openMinutes: 60 });
  });

  it("is empty without entries", () => {
    expect(summarizeEntries([])).toEqual({ totalMinutes: 0, openMinutes: 0, billedMinutes: 0, openAmountCent: 0 });
  });
});
