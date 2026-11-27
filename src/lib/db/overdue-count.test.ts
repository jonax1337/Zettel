import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { countInvoiceTabs } from "../../routes/parts/list/invoice-tabs";
import { nowUnix } from "$lib/utils/date";
import { listInvoices } from "./invoices";
import { countOverdueInvoices, listOverdueInvoices } from "./reminders";

const DAY = 86_400;
const TOTAL = 11_900;
const PAST = nowUnix() - 10 * DAY;
const FUTURE = nowUnix() + 10 * DAY;

const database = (): SqliteDatabase => sqlite.current!;

function seed(number: string, status: string, dueDate: number, credit?: { status: string; corrects: number; total: number }) {
  const result = database()
    .prepare(
      `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status,
                             subtotal, vat_amount, total, is_credit_note, corrects_invoice_id, currency)
       VALUES (?, 1, '{"name":"Acme GmbH"}', 1, ?, ?, ?, 0, ?, ?, ?, 'EUR')`,
    )
    .run(number, dueDate, status, credit?.total ?? TOTAL, credit?.total ?? TOTAL, credit ? 1 : 0, credit?.corrects ?? null);
  return Number(result.lastInsertRowid);
}

beforeEach(() => {
  sqlite.current = migratedDatabase();
  database().exec("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH')");
});

describe("countOverdueInvoices", () => {
  it("is 0 without invoices", async () => {
    expect(await countOverdueInvoices()).toBe(0);
  });

  it("counts what the Überfällig tab counts and the reminder list shows", async () => {
    seed("RE-1", "sent", PAST);
    seed("RE-2", "partial", PAST);
    seed("RE-3", "sent", FUTURE);
    seed("RE-4", "paid", PAST);
    seed("RE-5", "draft", PAST);
    seed("RE-6", "cancelled", PAST);
    const credited = seed("RE-7", "sent", PAST);
    seed("RE-8", "sent", PAST, { status: "sent", corrects: credited, total: -TOTAL });
    const partlyCredited = seed("RE-9", "sent", PAST);
    seed("RE-10", "sent", PAST, { status: "sent", corrects: partlyCredited, total: -3_000 });
    const draftCredit = seed("RE-11", "sent", PAST);
    seed("RE-12", "draft", PAST, { status: "draft", corrects: draftCredit, total: -TOTAL });

    const tabCount = countInvoiceTabs(await listInvoices(), 0, nowUnix()).overdue;

    expect(await countOverdueInvoices()).toBe(4);
    expect(await countOverdueInvoices()).toBe(tabCount);
    expect(await countOverdueInvoices()).toBe((await listOverdueInvoices()).length);
  });
});
