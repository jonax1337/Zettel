import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeEntries } from "$lib/time/summary";
import { migratedDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { deleteInvoice } from "./invoices";
import { EMPTY_PROJECT_TIME_FIGURES, loadProjectTimeFigures } from "./project-overview";
import { createProject } from "./projects";
import { billTimeEntries, type TimeBillingOptions } from "./time-billing";
import { createTimeEntry, listTimeEntries, startTimer } from "./time-entries";

const GROUPED: TimeBillingOptions = { grouping: "perProject", incrementMinutes: 1 };
const day = (d: number) => new Date(2026, 4, d).getTime() / 1000;

let website: number;
let app: number;
let unused: number;

const entry = (projectId: number, minutes: number) =>
  createTimeEntry({
    projectId,
    entryDate: day(5),
    description: "",
    timing: { mode: "duration", durationMinutes: minutes },
  });

beforeEach(async () => {
  sqlite.current = migratedDatabase();
  sqlite.current.exec("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH')");
  website = await createProject({ customerId: 1, name: "Website", hourlyRateCent: 9_500 });
  app = await createProject({ customerId: 1, name: "App", hourlyRateCent: 12_000 });
  unused = await createProject({ customerId: 1, name: "Leer", hourlyRateCent: 9_500 });
});

describe("loadProjectTimeFigures", () => {
  it("splits finished minutes into open and billed per project", async () => {
    await entry(website, 90);
    await entry(website, 30);
    const billed = await entry(website, 60);
    await entry(app, 45);
    await billTimeEntries([billed], GROUPED);

    const figures = await loadProjectTimeFigures();

    expect(figures.get(website)).toEqual({ openMinutes: 120, billedMinutes: 60 });
    expect(figures.get(app)).toEqual({ openMinutes: 45, billedMinutes: 0 });
  });

  it("leaves a running timer out of both figures", async () => {
    await entry(website, 30);
    await startTimer(website, "läuft");

    expect((await loadProjectTimeFigures()).get(website)).toEqual({ openMinutes: 30, billedMinutes: 0 });
  });

  it("counts the entries of a discarded draft as open again", async () => {
    const ids = [await entry(website, 90), await entry(website, 30)];
    const draftId = await billTimeEntries(ids, GROUPED);
    expect((await loadProjectTimeFigures()).get(website)).toEqual({ openMinutes: 0, billedMinutes: 120 });

    await deleteInvoice(draftId);

    expect((await loadProjectTimeFigures()).get(website)).toEqual({ openMinutes: 120, billedMinutes: 0 });
  });

  it("omits a project without entries", async () => {
    await entry(website, 10);

    const figures = await loadProjectTimeFigures();

    expect(figures.has(unused)).toBe(false);
    expect(EMPTY_PROJECT_TIME_FIGURES).toEqual({ openMinutes: 0, billedMinutes: 0 });
  });

  it("matches the Zeiten summary for the same entries", async () => {
    await entry(website, 90);
    await entry(app, 45);
    const billed = await entry(website, 60);
    await billTimeEntries([billed], GROUPED);
    await startTimer(app, "läuft");

    const summary = summarizeEntries(await listTimeEntries());
    const figures = [...(await loadProjectTimeFigures()).values()];

    expect(figures.reduce((sum, f) => sum + f.openMinutes, 0)).toBe(summary.openMinutes);
    expect(figures.reduce((sum, f) => sum + f.billedMinutes, 0)).toBe(summary.billedMinutes);
  });
});
