import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { entryInputFromForm, formFromEntry } from "../../routes/time/entry-form";
import { assertCustomerDeletable } from "./references";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  setProjectArchived,
  updateProject,
} from "./projects";
import {
  createTimeEntry,
  deleteTimeEntry,
  getRunningTimer,
  listTimeEntries,
  startTimer,
  stopTimer,
  updateTimeEntry,
  type TimeEntryInput,
} from "./time-entries";

const at = (day: number, h = 0, m = 0, s = 0) => new Date(2026, 4, day, h, m, s).getTime() / 1000;
const day = (d: number) => at(d);

const setClock = (unixSeconds: number) => vi.setSystemTime(unixSeconds * 1000);

const database = (): SqliteDatabase => sqlite.current!;

function rows<T>(query: string, ...bindings: (string | number)[]): T[] {
  return database().prepare(query).all(...bindings) as T[];
}

function manual(projectId: number, overrides: Partial<TimeEntryInput> = {}): TimeEntryInput {
  return {
    projectId,
    entryDate: day(5),
    description: "Konzept",
    timing: { mode: "duration", durationMinutes: 90 },
    ...overrides,
  };
}

/** An invoice row the entries can point at. */
function insertInvoice(id: number, status: "draft" | "sent", number = `DRAFT-${id}`): void {
  database().exec(
    `INSERT INTO invoices (id, number, customer_id, issue_date, due_date, status)
     VALUES (${id}, '${number}', 1, 1, 2, '${status}')`,
  );
}

let websiteId: number;
let appId: number;

beforeEach(async () => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  database().exec(`
    INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH'), (2, 'K-0002', 'Beta AG');
  `);
  websiteId = await createProject({ customerId: 1, name: "Website", hourlyRateCent: 9_500 });
  appId = await createProject({ customerId: 2, name: "App", hourlyRateCent: 12_000 });
});

afterEach(() => vi.useRealTimers());

describe("projects", () => {
  it("lists the projects of active customers with the customer name and entry count", async () => {
    await createTimeEntry(manual(websiteId));

    const list = await listProjects();

    expect(list.map((p) => [p.name, p.customerName, p.hourlyRateCent, p.entryCount])).toEqual([
      ["Website", "Acme GmbH", 9_500, 1],
      ["App", "Beta AG", 12_000, 0],
    ]);
  });

  it("filters by customer and hides archived projects unless asked", async () => {
    await setProjectArchived(appId, true);

    expect((await listProjects()).map((p) => p.name)).toEqual(["Website"]);
    expect((await listProjects({ includeArchived: true })).map((p) => p.name)).toEqual(["Website", "App"]);
    expect((await listProjects({ customerId: 2, includeArchived: true })).map((p) => p.name)).toEqual(["App"]);
  });

  it("trims the name and rejects a blank name or a negative rate", async () => {
    const id = await createProject({ customerId: 1, name: "  Support  ", hourlyRateCent: 0 });

    expect((await getProject(id))?.name).toBe("Support");
    await expect(createProject({ customerId: 1, name: "  ", hourlyRateCent: 100 })).rejects.toThrow("Projektnamen");
    await expect(createProject({ customerId: 1, name: "X", hourlyRateCent: -1 })).rejects.toThrow("Stundensatz");
  });

  it("updates name and rate", async () => {
    await updateProject(websiteId, { customerId: 1, name: "Relaunch", hourlyRateCent: 10_000 });

    expect(await getProject(websiteId)).toMatchObject({ name: "Relaunch", hourlyRateCent: 10_000 });
  });

  it("keeps the customer of a project that has entries", async () => {
    await createTimeEntry(manual(websiteId));

    await expect(updateProject(websiteId, { customerId: 2, name: "Website", hourlyRateCent: 9_500 })).rejects.toThrow(
      "Kunde eines Projekts",
    );
    await updateProject(appId, { customerId: 1, name: "App", hourlyRateCent: 12_000 });
    expect((await getProject(appId))?.customerId).toBe(1);
  });

  it("deletes a project without entries and refuses one with entries", async () => {
    await createTimeEntry(manual(websiteId));

    await expect(deleteProject(websiteId)).rejects.toThrow("nur archiviert");
    await deleteProject(appId);

    expect(await getProject(appId)).toBeNull();
    expect(await getProject(websiteId)).not.toBeNull();
  });

  it("keeps a customer with projects from being deleted", async () => {
    await expect(assertCustomerDeletable(1)).rejects.toThrow("1 Projekt");
    await deleteProject(websiteId);
    await expect(assertCustomerDeletable(1)).resolves.toBeUndefined();
  });
});

describe("manual entries", () => {
  it("stores a typed duration without clock times", async () => {
    const id = await createTimeEntry(manual(websiteId, { description: "  Konzept  " }));

    const [entry] = await listTimeEntries();

    expect(entry).toMatchObject({
      id,
      projectId: websiteId,
      entryDate: day(5),
      startedAt: null,
      endedAt: null,
      durationMinutes: 90,
      description: "Konzept",
      invoiceId: null,
      projectName: "Website",
      hourlyRateCent: 9_500,
      customerId: 1,
      customerName: "Acme GmbH",
      invoiceNumber: null,
      invoiceStatus: null,
    });
  });

  it("derives the duration of a clock range", async () => {
    await createTimeEntry(
      manual(websiteId, { timing: { mode: "range", startedAt: at(5, 9, 0), endedAt: at(5, 10, 45) } }),
    );

    const [entry] = await listTimeEntries();

    expect(entry).toMatchObject({ startedAt: at(5, 9), endedAt: at(5, 10, 45), durationMinutes: 105 });
  });

  it("rejects invalid timing and archived projects without writing", async () => {
    await setProjectArchived(appId, true);

    await expect(createTimeEntry(manual(websiteId, { timing: { mode: "duration", durationMinutes: 0 } }))).rejects.toThrow(
      "Dauer",
    );
    await expect(createTimeEntry(manual(appId))).rejects.toThrow("archiviert");
    await expect(createTimeEntry(manual(999))).rejects.toThrow("nicht gefunden");

    expect(await listTimeEntries()).toEqual([]);
  });

  it("refuses a kept timing on a new entry", async () => {
    await expect(createTimeEntry(manual(websiteId, { timing: { mode: "keep" } }))).rejects.toThrow(
      "braucht Beginn und Ende oder eine Dauer",
    );

    expect(await listTimeEntries()).toEqual([]);
  });

  it("keeps the entries of an archived project listed and editable", async () => {
    const id = await createTimeEntry(manual(websiteId));
    await setProjectArchived(websiteId, true);

    await updateTimeEntry(id, manual(websiteId, { description: "Nachtrag" }));

    expect((await listTimeEntries())[0].description).toBe("Nachtrag");
  });

  it("moves an entry to another project only if that project is active", async () => {
    const id = await createTimeEntry(manual(websiteId));
    await setProjectArchived(appId, true);

    await expect(updateTimeEntry(id, manual(appId))).rejects.toThrow("archiviert");
    await setProjectArchived(appId, false);
    await updateTimeEntry(id, manual(appId));

    expect((await listTimeEntries())[0].projectName).toBe("App");
  });

  it("deletes an open entry", async () => {
    const id = await createTimeEntry(manual(websiteId));

    await deleteTimeEntry(id);

    expect(await listTimeEntries()).toEqual([]);
  });

  it("ignores deleting an entry that is already gone", async () => {
    await expect(deleteTimeEntry(404)).resolves.toBeUndefined();
  });
});

describe("billed entries", () => {
  let entryId: number;

  beforeEach(async () => {
    entryId = await createTimeEntry(manual(websiteId));
    insertInvoice(7, "draft");
    database().exec(`UPDATE time_entries SET invoice_id = 7 WHERE id = ${entryId}`);
  });

  it("cannot be edited or deleted", async () => {
    await expect(updateTimeEntry(entryId, manual(websiteId, { description: "x" }))).rejects.toThrow("Abgerechnete");
    await expect(deleteTimeEntry(entryId)).rejects.toThrow("Abgerechnete");

    expect(await listTimeEntries()).toHaveLength(1);
    expect((await listTimeEntries())[0].description).toBe("Konzept");
  });

  it("show the invoice they are on, with a draft number in display form", async () => {
    const [entry] = await listTimeEntries();

    expect(entry.invoiceStatus).toBe("draft");
    expect(entry.invoiceNumber).toMatch(/^Entwurf #/);
  });
});

describe("listing", () => {
  beforeEach(async () => {
    insertInvoice(7, "sent", "RE-2026-0001");
    const billed = await createTimeEntry(manual(websiteId, { entryDate: day(4), description: "alt" }));
    database().exec(`UPDATE time_entries SET invoice_id = 7 WHERE id = ${billed}`);
    await createTimeEntry(manual(websiteId, { entryDate: day(5), description: "Website" }));
    await createTimeEntry(manual(appId, { entryDate: day(6), description: "App" }));
    await createTimeEntry(manual(websiteId, { entryDate: day(12), description: "später" }));
  });

  const descriptions = async (filter: Parameters<typeof listTimeEntries>[0]) =>
    (await listTimeEntries(filter)).map((e) => e.description);

  it("lists the newest work day first", async () => {
    expect(await descriptions({})).toEqual(["später", "App", "Website", "alt"]);
  });

  it("filters by period with an exclusive end", async () => {
    expect(await descriptions({ period: { start: day(5), end: day(12) } })).toEqual(["App", "Website"]);
    expect(await descriptions({ period: { start: day(5), end: day(13) } })).toEqual(["später", "App", "Website"]);
  });

  it("filters by customer and project", async () => {
    expect(await descriptions({ customerId: 2 })).toEqual(["App"]);
    expect(await descriptions({ projectId: websiteId })).toEqual(["später", "Website", "alt"]);
    expect(await descriptions({ customerId: "all", projectId: "all" })).toHaveLength(4);
  });

  it("filters by billing status", async () => {
    expect(await descriptions({ status: "billed" })).toEqual(["alt"]);
    expect(await descriptions({ status: "open" })).toEqual(["später", "App", "Website"]);
    expect(await descriptions({ status: "all" })).toHaveLength(4);
  });

  it("shows the billed entry's invoice number and status", async () => {
    const [billed] = await listTimeEntries({ status: "billed" });

    expect(billed.invoiceStatus).toBe("sent");
    expect(billed.invoiceNumber).toBe("RE-2026-0001");
  });

  it("counts the running timer as open", async () => {
    await startTimer(websiteId, "läuft");

    expect((await listTimeEntries({ status: "open" })).map((e) => e.description)).toContain("läuft");
  });
});

describe("editing a stopped timer entry", () => {
  const storedTiming = () =>
    rows("SELECT entry_date, started_at, ended_at, duration_minutes FROM time_entries");

  async function saveUnchanged(id: number): Promise<void> {
    const [row] = await listTimeEntries();
    await updateTimeEntry(id, entryInputFromForm(formFromEntry(row), row));
  }

  it("keeps the seconds-precise times and the duration when saved unchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setClock(at(5, 9, 0, 0));
    const id = await startTimer(websiteId, "Sprint");
    setClock(at(5, 10, 29, 40));
    await stopTimer();
    const before = storedTiming();

    await saveUnchanged(id);

    expect(storedTiming()).toEqual(before);
    expect(before).toEqual([
      { entry_date: day(5), started_at: at(5, 9), ended_at: at(5, 10, 29, 40), duration_minutes: 90 },
    ]);
  });

  it("takes the kept timing from the stored row, not from the caller", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setClock(at(5, 9, 0, 0));
    const id = await startTimer(websiteId, "Sprint");
    setClock(at(5, 10, 29, 40));
    await stopTimer();
    const before = storedTiming();

    await updateTimeEntry(id, manual(websiteId, { description: "Neu", timing: { mode: "keep" } }));

    expect(storedTiming()).toEqual(before);
    expect((await listTimeEntries())[0].description).toBe("Neu");
  });

  it("keeps a timer that ran past midnight when saved unchanged", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setClock(at(5, 23, 30));
    const id = await startTimer(websiteId, "Nachtschicht");
    setClock(at(6, 0, 10));
    await stopTimer();
    const before = storedTiming();

    await saveUnchanged(id);

    expect(storedTiming()).toEqual(before);
  });
});

describe("timer", () => {
  it("starts on the day of its start time and survives a restart through the stored start", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setClock(at(5, 9, 0, 0));

    const id = await startTimer(websiteId, "  Sprint  ");
    setClock(at(5, 9, 30, 0));
    const running = await getRunningTimer();

    expect(running).toMatchObject({
      id,
      entryDate: day(5),
      startedAt: at(5, 9),
      endedAt: null,
      durationMinutes: null,
      description: "Sprint",
      projectName: "Website",
    });
  });

  it("rejects a second timer with a German message and keeps the first", async () => {
    const first = await startTimer(websiteId, "eins");

    await expect(startTimer(appId, "zwei")).rejects.toThrow("Es läuft bereits ein Timer");

    expect((await getRunningTimer())?.id).toBe(first);
    expect(rows("SELECT id FROM time_entries")).toHaveLength(1);
  });

  it("lets a new timer start once the first one is stopped", async () => {
    await startTimer(websiteId, "eins");
    await stopTimer();

    await expect(startTimer(appId, "zwei")).resolves.toBeGreaterThan(0);
  });

  it("refuses an archived project", async () => {
    await setProjectArchived(websiteId, true);

    await expect(startTimer(websiteId, "x")).rejects.toThrow("archiviert");
    expect(await getRunningTimer()).toBeNull();
  });

  it("stops with the elapsed minutes, rounded to the nearest", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setClock(at(5, 9, 0, 0));
    const id = await startTimer(websiteId, "");
    setClock(at(5, 10, 29, 40));

    const stopped = await stopTimer();

    expect(stopped).toMatchObject({ id, endedAt: at(5, 10, 29, 40), durationMinutes: 90 });
    expect(await getRunningTimer()).toBeNull();
    expect(rows("SELECT duration_minutes, ended_at FROM time_entries")).toEqual([
      { duration_minutes: 90, ended_at: at(5, 10, 29, 40) },
    ]);
  });

  it("books at least one minute for an instant stop", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setClock(at(5, 9, 0, 0));
    await startTimer(websiteId, "");
    setClock(at(5, 9, 0, 10));

    expect((await stopTimer()).durationMinutes).toBe(1);
  });

  it("keeps the day it started on when it runs past midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    setClock(at(5, 23, 30));
    await startTimer(websiteId, "Nachtschicht");
    setClock(at(6, 0, 10));

    const stopped = await stopTimer();

    expect(stopped).toMatchObject({ entryDate: day(5), durationMinutes: 40 });
  });

  it("refuses to stop when nothing runs", async () => {
    await expect(stopTimer()).rejects.toThrow("Es läuft kein Timer");
  });

  it("does not let a running timer be edited, but discards it on delete", async () => {
    const id = await startTimer(websiteId, "läuft");

    await expect(updateTimeEntry(id, manual(websiteId))).rejects.toThrow("stoppen");
    await deleteTimeEntry(id);

    expect(await getRunningTimer()).toBeNull();
  });
});
