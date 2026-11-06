import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { listInvoiceHistory } from "./audit";
import { createCreditNoteFromInvoice, issueInvoice } from "./invoices";
import { createProject } from "./projects";
import {
  billTimeEntries,
  countReleasableTimeEntries,
  releaseTimeEntriesOfReversedInvoice,
} from "./time-billing";
import { createTimeEntry, listTimeEntries } from "./time-entries";

const day = (d: number) => new Date(2026, 4, d).getTime() / 1000;

const database = (): SqliteDatabase => sqlite.current!;

function rows<T>(query: string, ...bindings: (string | number)[]): T[] {
  return database().prepare(query).all(...bindings) as T[];
}

const invoiceIdsOfEntries = () =>
  rows<{ invoice_id: number | null }>("SELECT invoice_id FROM time_entries ORDER BY id").map((r) => r.invoice_id);

const GROUPED = { grouping: "perProject", incrementMinutes: 1 } as const;

let entryIds: number[];

/** Bills both entries, issues the invoice and returns its id and total (19 % VAT on 1,5 h x 95 EUR + 0,25 h x 120 EUR). */
async function issuedTimeInvoice(): Promise<{ id: number; total: number }> {
  const id = await billTimeEntries(entryIds, GROUPED);
  await issueInvoice(id);
  const [{ total }] = rows<{ total: number }>("SELECT total FROM invoices WHERE id = ?", id);
  return { id, total };
}

/** A credit note row as the credit note flow stores it: negative total, pointing at its original. */
function seedCreditNote(originalId: number, amountCent: number, options: { status?: string; currency?: string } = {}) {
  database()
    .prepare(
      `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status,
                             subtotal, vat_amount, total, is_credit_note, corrects_invoice_id, currency)
       VALUES (?, 1, '{"name":"Acme GmbH"}', ?, ?, ?, ?, 0, ?, 1, ?, ?)`,
    )
    .run(
      `RE-CN-${Math.random().toString(36).slice(2)}`,
      day(20),
      day(30),
      options.status ?? "sent",
      -amountCent,
      -amountCent,
      originalId,
      options.currency ?? "EUR",
    );
}

beforeEach(async () => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  database().exec(`
    INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH');
    UPDATE settings SET is_kleinunternehmer = 0, default_payment_terms_days = 14 WHERE id = 1;
  `);
  const website = await createProject({ customerId: 1, name: "Website", hourlyRateCent: 9_500 });
  const app = await createProject({ customerId: 1, name: "App", hourlyRateCent: 12_000 });
  entryIds = [
    await createTimeEntry({ projectId: website, entryDate: day(5), description: "Konzept", timing: { mode: "duration", durationMinutes: 90 } }),
    await createTimeEntry({ projectId: app, entryDate: day(6), description: "", timing: { mode: "duration", durationMinutes: 15 } }),
  ];
});

describe("releaseTimeEntriesOfReversedInvoice", () => {
  it("frees the entries of an invoice fully reversed by one credit note and makes them billable again", async () => {
    const { id } = await issuedTimeInvoice();
    const creditNoteId = await createCreditNoteFromInvoice(id);
    await issueInvoice(creditNoteId);

    await expect(releaseTimeEntriesOfReversedInvoice(id)).resolves.toBe(2);

    expect(invoiceIdsOfEntries()).toEqual([null, null]);
    expect(await listTimeEntries({ status: "open" })).toHaveLength(2);
    await expect(billTimeEntries(entryIds, GROUPED)).resolves.toBeGreaterThan(creditNoteId);
  });

  it("frees the entries once several credit notes together cover the total", async () => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, 10_000);
    seedCreditNote(id, total - 10_000);

    await expect(releaseTimeEntriesOfReversedInvoice(id)).resolves.toBe(2);

    expect(invoiceIdsOfEntries()).toEqual([null, null]);
  });

  it("frees only the entries of the reversed invoice", async () => {
    const { id, total } = await issuedTimeInvoice();
    const website = rows<{ id: number }>("SELECT id FROM projects WHERE name = 'Website'")[0].id;
    const other = await createTimeEntry({ projectId: website, entryDate: day(9), description: "Neu", timing: { mode: "duration", durationMinutes: 30 } });
    const otherInvoice = await billTimeEntries([other], GROUPED);
    seedCreditNote(id, total);

    await releaseTimeEntriesOfReversedInvoice(id);

    expect(invoiceIdsOfEntries()).toEqual([null, null, otherInvoice]);
  });

  it("refuses a partially reversed invoice and keeps the entries billed", async () => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, total - 1);

    await expect(releaseTimeEntriesOfReversedInvoice(id)).rejects.toThrow("nicht vollständig storniert");

    expect(invoiceIdsOfEntries()).toEqual([id, id]);
  });

  it("refuses an invoice without a credit note", async () => {
    const { id } = await issuedTimeInvoice();

    await expect(releaseTimeEntriesOfReversedInvoice(id)).rejects.toThrow("nicht vollständig storniert");

    expect(invoiceIdsOfEntries()).toEqual([id, id]);
  });

  it.each(["draft", "cancelled"])("does not count a credit note that is still %s", async (status) => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, total, { status });

    await expect(releaseTimeEntriesOfReversedInvoice(id)).rejects.toThrow("nicht vollständig storniert");

    expect(invoiceIdsOfEntries()).toEqual([id, id]);
  });

  it("does not count a credit note in another currency", async () => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, total, { currency: "USD" });

    await expect(releaseTimeEntriesOfReversedInvoice(id)).rejects.toThrow("nicht vollständig storniert");

    expect(invoiceIdsOfEntries()).toEqual([id, id]);
  });

  it("refuses an invoice that has no billed time", async () => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, total);
    await releaseTimeEntriesOfReversedInvoice(id);

    await expect(releaseTimeEntriesOfReversedInvoice(id)).rejects.toThrow("Keine abgerechneten Zeiten");
  });

  it("refuses an invoice that does not exist", async () => {
    await expect(releaseTimeEntriesOfReversedInvoice(9_999)).rejects.toThrow("Keine abgerechneten Zeiten");
  });

  it("never frees the entries of a draft", async () => {
    const id = await billTimeEntries(entryIds, GROUPED);

    await expect(releaseTimeEntriesOfReversedInvoice(id)).rejects.toThrow("nicht vollständig storniert");

    expect(invoiceIdsOfEntries()).toEqual([id, id]);
  });

  it("writes one audit row per freed entry, shown in the invoice's history", async () => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, total);

    await releaseTimeEntriesOfReversedInvoice(id);

    const history = (await listInvoiceHistory(id)).filter((entry) => entry.tableName === "time_entries");
    expect(history.map((entry) => [entry.rowId, entry.parentId, entry.action, entry.oldValues, entry.newValues])).toEqual(
      [...entryIds].reverse().map((entryId) => [entryId, id, "update", { invoice_id: id }, { invoice_id: null }]),
    );
  });

  it("writes no audit row when it refuses", async () => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, total - 1);

    await expect(releaseTimeEntriesOfReversedInvoice(id)).rejects.toThrow();

    expect(rows("SELECT id FROM audit_log WHERE table_name = 'time_entries'")).toEqual([]);
  });
});

describe("countReleasableTimeEntries", () => {
  it("counts the billed entries of a fully reversed invoice only", async () => {
    const { id, total } = await issuedTimeInvoice();
    expect(await countReleasableTimeEntries(id)).toBe(0);

    seedCreditNote(id, total - 1);
    expect(await countReleasableTimeEntries(id)).toBe(0);

    seedCreditNote(id, 1);
    expect(await countReleasableTimeEntries(id)).toBe(2);
  });

  it("is zero once the entries are free", async () => {
    const { id, total } = await issuedTimeInvoice();
    seedCreditNote(id, total);
    await releaseTimeEntriesOfReversedInvoice(id);

    expect(await countReleasableTimeEntries(id)).toBe(0);
  });
});

describe("time entry list rows", () => {
  it("flag billed entries whose invoice is fully reversed", async () => {
    const { id, total } = await issuedTimeInvoice();
    const flags = async () => (await listTimeEntries({ status: "billed" })).map((row) => row.invoiceReversed);

    expect(await flags()).toEqual([false, false]);

    seedCreditNote(id, total - 1);
    expect(await flags()).toEqual([false, false]);

    seedCreditNote(id, 1);
    expect(await flags()).toEqual([true, true]);
  });

  it("do not flag open entries", async () => {
    expect((await listTimeEntries({ status: "open" })).map((row) => row.invoiceReversed)).toEqual([false, false]);
  });
});
