import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { cancelInvoice, createInvoice, deleteInvoice, getInvoice, issueInvoice, type InvoiceFormInput } from "./invoices";
import { createProject } from "./projects";
import { billTimeEntries, previewTimeBilling } from "./time-billing";
import { createTimeEntry, listTimeEntries, updateTimeEntry } from "./time-entries";
import { itemsPayload } from "$lib/sidecar/payload";
import { addDaysUnix, startOfDayUnix } from "$lib/utils/date";

const day = (d: number) => new Date(2026, 4, d).getTime() / 1000;

const database = (): SqliteDatabase => sqlite.current!;

function rows<T>(query: string, ...bindings: (string | number)[]): T[] {
  return database().prepare(query).all(...bindings) as T[];
}

const invoiceCount = () => rows<{ n: number }>("SELECT COUNT(*) AS n FROM invoices")[0].n;
const invoiceIdsOfEntries = () =>
  rows<{ invoice_id: number | null }>("SELECT invoice_id FROM time_entries ORDER BY id").map((r) => r.invoice_id);

const GROUPED = { grouping: "perProject", incrementMinutes: 1 } as const;

let website: number;
let app: number;
let otherCustomerProject: number;
const entry: Record<"konzept" | "review" | "appWork", number> = { konzept: 0, review: 0, appWork: 0 };

async function addEntry(projectId: number, entryDate: number, durationMinutes: number, description: string) {
  return createTimeEntry({ projectId, entryDate, description, timing: { mode: "duration", durationMinutes } });
}

beforeEach(async () => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  database().exec(`
    INSERT INTO customers (id, customer_number, name, leitweg_id) VALUES
      (1, 'K-0001', 'Acme GmbH', '04011000-1234512345-06'),
      (2, 'K-0002', 'Beta AG', NULL);
    UPDATE settings SET is_kleinunternehmer = 0, default_payment_terms_days = 14 WHERE id = 1;
  `);
  website = await createProject({ customerId: 1, name: "Website", hourlyRateCent: 9_500 });
  app = await createProject({ customerId: 1, name: "App", hourlyRateCent: 12_000 });
  otherCustomerProject = await createProject({ customerId: 2, name: "Beratung", hourlyRateCent: 8_000 });
  entry.konzept = await addEntry(website, day(5), 90, "Konzept");
  entry.review = await addEntry(website, day(7), 45, "Review");
  entry.appWork = await addEntry(app, day(6), 15, "");
});

describe("billTimeEntries", () => {
  it("creates a draft with one position per project and links the entries", async () => {
    const id = await billTimeEntries(Object.values(entry), GROUPED);

    const { invoice, items } = (await getInvoice(id))!;

    expect(invoice).toMatchObject({
      customerId: 1,
      status: "draft",
      supplyKind: "services",
      reverseChargeType: "none",
      deliveryDate: null,
      servicePeriodStart: day(5),
      servicePeriodEnd: day(7),
      buyerReference: "04011000-1234512345-06",
      isKleinunternehmer: false,
      subtotal: 24_375,
      vatAmount: 4_631,
      total: 29_006,
    });
    expect(invoice.dueDate).toBe(addDaysUnix(startOfDayUnix(new Date()), 14));
    expect(invoice.paymentTerms).toBe("Zahlbar innerhalb von 14 Tagen ohne Abzug.");
    expect(items.map((i) => [i.description, i.quantity, i.unit, i.unitPrice, i.vatRate, i.lineTotal])).toEqual([
      ["Website", 2.25, "Std", 9_500, 19, 21_375],
      ["App", 0.25, "Std", 12_000, 19, 3_000],
    ]);
    expect(items.map((i) => [i.linePeriodStart, i.linePeriodEnd])).toEqual([
      [day(5), day(7)],
      [day(6), day(6)],
    ]);
    expect(items[0].longDescription).toBe("05.05.2026 · 1:30 · Konzept\n07.05.2026 · 0:45 · Review");
    expect(invoiceIdsOfEntries()).toEqual([id, id, id]);
  });

  it("hands the sidecar the unit and the line periods of the positions", async () => {
    const { items } = (await getInvoice(await billTimeEntries(Object.values(entry), GROUPED)))!;

    expect(itemsPayload(items)[0]).toMatchObject({
      unit: "Std",
      quantity: 2.25,
      linePeriodStart: day(5),
      linePeriodEnd: day(7),
    });
  });

  it("makes one single-day position per entry when asked to", async () => {
    const id = await billTimeEntries(Object.values(entry), { grouping: "perEntry", incrementMinutes: 15 });

    const { items } = (await getInvoice(id))!;

    expect(items.map((i) => [i.description, i.quantity, i.linePeriodStart === i.linePeriodEnd])).toEqual([
      ["Konzept", 1.5, true],
      ["App", 0.25, true],
      ["Review", 0.75, true],
    ]);
  });

  it("books no VAT for a Kleinunternehmer", async () => {
    database().exec("UPDATE settings SET is_kleinunternehmer = 1 WHERE id = 1");

    const { invoice, items } = (await getInvoice(await billTimeEntries(Object.values(entry), GROUPED)))!;

    expect(items.map((i) => i.vatRate)).toEqual([0, 0]);
    expect(invoice).toMatchObject({ isKleinunternehmer: true, vatAmount: 0, total: 24_375 });
  });

  it("previews exactly the positions it then creates", async () => {
    const preview = await previewTimeBilling(Object.values(entry), GROUPED);

    const { items } = (await getInvoice(await billTimeEntries(Object.values(entry), GROUPED)))!;

    expect(preview.lines.map((l) => [l.description, l.quantity, l.lineTotal])).toEqual(
      items.map((i) => [i.description, i.quantity, i.lineTotal]),
    );
  });

  it("bills a subset and leaves the other entries open", async () => {
    const id = await billTimeEntries([entry.konzept], GROUPED);

    expect(invoiceIdsOfEntries()).toEqual([id, null, null]);
    expect(await listTimeEntries({ status: "open" })).toHaveLength(2);
  });

  it("does not bill an entry twice and leaves no second draft", async () => {
    await billTimeEntries([entry.konzept, entry.review], GROUPED);

    await expect(billTimeEntries([entry.review, entry.appWork], GROUPED)).rejects.toThrow("inzwischen abgerechnet");

    expect(invoiceCount()).toBe(1);
    expect(invoiceIdsOfEntries()[2]).toBeNull();
  });

  it("deletes its draft and frees what it claimed when another billing wins a race", async () => {
    const other = await createInvoice({
      customerId: 1,
      issueDate: day(1),
      deliveryDate: null,
      dueDate: day(15),
      notes: null,
      paymentTerms: null,
      reverseChargeType: "none",
      supplyKind: "services",
      items: [],
    } satisfies InvoiceFormInput);
    let raced = false;
    sqlite.beforeExecute = (query) => {
      if (raced || !query.includes("SET invoice_id = ?")) return;
      raced = true;
      database().prepare("UPDATE time_entries SET invoice_id = ? WHERE id = ?").run(other, entry.review);
    };

    await expect(billTimeEntries(Object.values(entry), GROUPED)).rejects.toThrow("inzwischen abgerechnet");

    expect(invoiceCount()).toBe(1);
    expect(invoiceIdsOfEntries()).toEqual([null, other, null]);
  });

  it("deletes its draft when the claim itself fails", async () => {
    sqlite.beforeExecute = (query) => {
      if (query.includes("SET invoice_id = ?")) throw new Error("disk full");
    };

    await expect(billTimeEntries(Object.values(entry), GROUPED)).rejects.toThrow("disk full");
    sqlite.beforeExecute = null;

    expect(invoiceCount()).toBe(0);
    expect(invoiceIdsOfEntries()).toEqual([null, null, null]);
  });

  it("rejects entries of several customers without creating anything", async () => {
    const foreign = await addEntry(otherCustomerProject, day(8), 60, "fremd");

    await expect(billTimeEntries([entry.konzept, foreign], GROUPED)).rejects.toThrow("Einträge eines Kunden");

    expect(invoiceCount()).toBe(0);
  });

  it("rejects an empty selection", async () => {
    await expect(billTimeEntries([], GROUPED)).rejects.toThrow("mindestens einen Eintrag");
  });

  it("rejects an entry that no longer exists", async () => {
    await expect(billTimeEntries([entry.konzept, 9_999], GROUPED)).rejects.toThrow("existieren nicht mehr");

    expect(invoiceCount()).toBe(0);
  });

  it("rejects a running timer", async () => {
    database().exec(
      `INSERT INTO time_entries (project_id, entry_date, started_at, description) VALUES (${website}, ${day(9)}, ${day(9)}, 'läuft')`,
    );
    const running = rows<{ id: number }>("SELECT id FROM time_entries WHERE duration_minutes IS NULL")[0].id;

    await expect(billTimeEntries([entry.konzept, running], GROUPED)).rejects.toThrow("Timer");

    expect(invoiceCount()).toBe(0);
  });

  it("counts an entry listed twice once", async () => {
    const id = await billTimeEntries([entry.konzept, entry.konzept], GROUPED);

    const { items } = (await getInvoice(id))!;

    expect(items.map((i) => i.quantity)).toEqual([1.5]);
  });
});

describe("the draft and its entries", () => {
  it("deleting the draft frees the entries even with foreign keys off", async () => {
    database().exec("PRAGMA foreign_keys = OFF");
    const id = await billTimeEntries(Object.values(entry), GROUPED);

    await deleteInvoice(id);

    expect(invoiceIdsOfEntries()).toEqual([null, null, null]);
    expect(await listTimeEntries({ status: "billed" })).toEqual([]);
  });

  it("frees the entries by the foreign key alone when foreign keys are on", async () => {
    const id = await billTimeEntries(Object.values(entry), GROUPED);
    database().exec("PRAGMA foreign_keys = ON");

    database().prepare("DELETE FROM invoices WHERE id = ?").run(id);

    expect(invoiceIdsOfEntries()).toEqual([null, null, null]);
  });

  it("deletes the draft with foreign keys on", async () => {
    database().exec("PRAGMA foreign_keys = ON");
    const id = await billTimeEntries(Object.values(entry), GROUPED);

    await deleteInvoice(id);

    expect(invoiceIdsOfEntries()).toEqual([null, null, null]);
  });

  it("makes freed entries billable again", async () => {
    await deleteInvoice(await billTimeEntries(Object.values(entry), GROUPED));

    await expect(billTimeEntries(Object.values(entry), GROUPED)).resolves.toBeGreaterThan(0);
  });

  it("frees the entries when the draft is discarded", async () => {
    const id = await billTimeEntries(Object.values(entry), GROUPED);

    await cancelInvoice(id);

    expect(invoiceIdsOfEntries()).toEqual([null, null, null]);
    expect((await getInvoice(id))!.invoice.status).toBe("cancelled");
    await expect(billTimeEntries(Object.values(entry), GROUPED)).resolves.toBeGreaterThan(id);
  });

  it("frees only the entries of the discarded draft", async () => {
    const first = await billTimeEntries([entry.konzept], GROUPED);
    const second = await billTimeEntries([entry.review], GROUPED);

    await cancelInvoice(second);

    expect(invoiceIdsOfEntries()).toEqual([first, null, null]);
  });

  it("keeps the entries billed when the invoice cannot be discarded", async () => {
    const id = await billTimeEntries(Object.values(entry), GROUPED);
    await issueInvoice(id);

    await expect(cancelInvoice(id)).rejects.toThrow();

    expect(invoiceIdsOfEntries()).toEqual([id, id, id]);
  });

  it("keeps an issued invoice's entries billed", async () => {
    const id = await billTimeEntries(Object.values(entry), GROUPED);
    await issueInvoice(id);

    await expect(updateTimeEntry(entry.konzept, {
      projectId: website,
      entryDate: day(5),
      description: "x",
      timing: { mode: "duration", durationMinutes: 10 },
    })).rejects.toThrow("Abgerechnete");

    expect(invoiceIdsOfEntries()).toEqual([id, id, id]);
  });
});
