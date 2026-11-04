import { beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error The project has no @types/node; node:sqlite is only used to run the real SQL in tests.
import { DatabaseSync } from "node:sqlite";

type SqliteValue = string | number | null;
type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...bindings: SqliteValue[]): unknown[];
    run(...bindings: SqliteValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
};

const sqlite = vi.hoisted(() => ({ current: null as SqliteDatabase | null }));
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  const execute = async (query: string, bindings: SqliteValue[] = []) => {
    const result = sqlite.current!.prepare(query).run(...bindings);
    return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
  };
  return {
    ...actual,
    select: async (query: string, bindings: SqliteValue[] = []) => sqlite.current!.prepare(query).all(...bindings),
    execute,
    insert: async (query: string, bindings: SqliteValue[] = []) => (await execute(query, bindings)).lastInsertId,
  };
});

import { matchBookings } from "$lib/bank/match";
import { addPayment, deletePayment, listPayments } from "./invoice-payments";
import { createInvoice, getInvoice, issueInvoice, listInvoices, markPaid, reopenDraft, updateInvoice } from "./invoices";
import type { InvoiceFormInput } from "./invoices";
import { listOverdueInvoices, remindableAmountCents } from "./reminders";

const MIGRATIONS = import.meta.glob<string>("./migrations/*.sql", { query: "?raw", import: "default", eager: true });

const TOTAL = 11_900;
const PAID_AT = 1_750_000_000;
const LONG_OVERDUE = 1_700_000_000;

function migratedDatabase(): SqliteDatabase {
  // Some migrations rebuild tables through sqlite_master, which node:sqlite's defensive mode forbids.
  const db = new DatabaseSync(":memory:", { defensive: false }) as SqliteDatabase;
  for (const path of Object.keys(MIGRATIONS).sort()) db.exec(MIGRATIONS[path]);
  db.exec("INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH')");
  return db;
}

function seedInvoice(
  number: string,
  total: number,
  credit?: { status: string; correctsInvoiceId: number },
  issueDate = LONG_OVERDUE,
): number {
  const result = sqlite.current!.prepare(
    `INSERT INTO invoices (number, customer_id, customer_snapshot, issue_date, due_date, status,
                           subtotal, vat_amount, total, is_credit_note, corrects_invoice_id, currency)
     VALUES (?, 1, '{"name":"Acme GmbH"}', ?, ?, ?, ?, 0, ?, ?, ?, 'EUR')`,
  ).run(
    number,
    issueDate,
    LONG_OVERDUE,
    credit?.status ?? "sent",
    total,
    total,
    credit ? 1 : 0,
    credit?.correctsInvoiceId ?? null,
  );
  return Number(result.lastInsertRowid);
}

/** The 119,00 € invoice RE-2026-0001, corrected by a credit note over `creditTotal` in `status`. */
function invoiceWithCreditNote(creditTotal: number, status = "sent"): number {
  const invoiceId = seedInvoice("RE-2026-0001", TOTAL);
  seedInvoice("RE-2026-0002", creditTotal, { status, correctsInvoiceId: invoiceId });
  return invoiceId;
}

function invoiceState(invoiceId: number) {
  const [row] = sqlite.current!.prepare("SELECT status, amount_paid_cent FROM invoices WHERE id = ?").all(invoiceId);
  return row as { status: string; amount_paid_cent: number };
}

async function listed(invoiceId: number) {
  return (await listInvoices()).find((invoice) => invoice.id === invoiceId)!;
}

function bookingOver(amountCent: number) {
  return { valutaDate: "2026-05-17", amountCent, currency: "EUR", partyName: "", purpose: "", transactionId: "tx-1" };
}

beforeEach(() => {
  sqlite.current = migratedDatabase();
});

describe("a partial credit note (119,00 € invoice, 30,00 € credited)", () => {
  it("leaves the invoice open in the list with the credited amount", async () => {
    const invoiceId = invoiceWithCreditNote(-3_000);

    expect(await listed(invoiceId)).toMatchObject({ creditedCent: 3_000, settledByCreditNote: false });
  });

  it("keeps it dunnable for the remainder", async () => {
    const invoiceId = invoiceWithCreditNote(-3_000);

    const [overdue] = await listOverdueInvoices();

    expect(overdue.invoice.id).toBe(invoiceId);
    expect(remindableAmountCents(overdue.invoice)).toBe(8_900);
  });

  it("matches a bank booking over the remainder", async () => {
    const invoiceId = invoiceWithCreditNote(-3_000);

    const [match] = matchBookings([bookingOver(8_900)], await listInvoices());

    expect(match.candidates.map((c) => c.invoice.id)).toEqual([invoiceId]);
  });

  it("rejects a payment above what payments and credit note leave open, then accepts the exact rest as paid", async () => {
    const invoiceId = invoiceWithCreditNote(-3_000);
    await addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 5_000 });

    await expect(addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 4_000 })).rejects.toThrow("übersteigt");
    await addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 3_900 });

    expect(invoiceState(invoiceId)).toEqual({ status: "paid", amount_paid_cent: 8_900 });
  });

  it("books exactly the remaining open amount when marked paid", async () => {
    const invoiceId = invoiceWithCreditNote(-3_000);
    await addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 5_000 });

    await markPaid(invoiceId, PAID_AT);

    expect((await listPayments(invoiceId)).map((p) => p.amountCent)).toEqual([5_000, 3_900]);
    expect(invoiceState(invoiceId)).toEqual({ status: "paid", amount_paid_cent: 8_900 });
  });
});

describe("a full credit note", () => {
  it("settles the invoice: not dunnable, not matchable, no payments", async () => {
    const invoiceId = invoiceWithCreditNote(-TOTAL);

    expect((await listed(invoiceId)).settledByCreditNote).toBe(true);
    expect(await listOverdueInvoices()).toEqual([]);
    expect(matchBookings([bookingOver(TOTAL)], await listInvoices())[0].candidates).toEqual([]);
    await expect(addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 100 })).rejects.toThrow("Stornorechnung");
    await expect(markPaid(invoiceId, PAID_AT)).rejects.toThrow("Stornorechnung");
  });
});

describe("a credit note dated in another year than its invoice", () => {
  const INVOICE_ISSUED = Date.UTC(2025, 11, 20) / 1000;
  const CREDIT_NOTE_ISSUED = Date.UTC(2026, 0, 10) / 1000;

  function invoiceFromLastYearCredited(creditCent: number): number {
    const invoiceId = seedInvoice("RE-2025-0001", TOTAL, undefined, INVOICE_ISSUED);
    seedInvoice("RE-2026-0001", -creditCent, { status: "sent", correctsInvoiceId: invoiceId }, CREDIT_NOTE_ISSUED);
    return invoiceId;
  }

  it("still reports a full credit note as settling the invoice in the invoice's year", async () => {
    const invoiceId = invoiceFromLastYearCredited(TOTAL);

    const [invoice] = await listInvoices({ year: 2025 });

    expect(invoice).toMatchObject({ id: invoiceId, creditedCent: TOTAL, settledByCreditNote: true });
  });

  it("still reports the credited amount of a partial credit note in the invoice's year", async () => {
    const invoiceId = invoiceFromLastYearCredited(3_000);

    const [invoice] = await listInvoices({ year: 2025 });

    expect(invoice).toMatchObject({ id: invoiceId, creditedCent: 3_000, settledByCreditNote: false });
  });
});

describe.each(["draft", "cancelled"])("a %s credit note", (status) => {
  it("is ignored: the full total stays open and payable", async () => {
    const invoiceId = invoiceWithCreditNote(-TOTAL, status);

    expect(await listed(invoiceId)).toMatchObject({ creditedCent: 0, settledByCreditNote: false });
    await markPaid(invoiceId, PAID_AT);
    expect(invoiceState(invoiceId)).toEqual({ status: "paid", amount_paid_cent: TOTAL });
  });
});

describe("the status of an invoice after payments and an issued credit note", () => {
  const INVOICE_TOTAL = 10_000;

  let pairs = 0;

  function originalWithDraftCreditNote(creditCent: number): { invoiceId: number; creditNoteId: number } {
    pairs += 1;
    const invoiceId = seedInvoice(`RE-2026-1${pairs}0`, INVOICE_TOTAL);
    const creditNoteId = seedInvoice(`RE-2026-1${pairs}1`, -creditCent, { status: "draft", correctsInvoiceId: invoiceId });
    return { invoiceId, creditNoteId };
  }

  function fullState(invoiceId: number) {
    const [row] = sqlite.current!.prepare("SELECT status, amount_paid_cent, paid_at FROM invoices WHERE id = ?").all(invoiceId);
    return row as { status: string; amount_paid_cent: number; paid_at: number | null };
  }

  it("is the same whether the payment or the credit note came first", async () => {
    const paymentFirst = originalWithDraftCreditNote(4_000);
    await addPayment({ invoiceId: paymentFirst.invoiceId, paidAt: PAID_AT, amountCent: 6_000 });
    await issueInvoice(paymentFirst.creditNoteId);

    const creditNoteFirst = originalWithDraftCreditNote(4_000);
    await issueInvoice(creditNoteFirst.creditNoteId);
    await addPayment({ invoiceId: creditNoteFirst.invoiceId, paidAt: PAID_AT, amountCent: 6_000 });

    expect(fullState(paymentFirst.invoiceId)).toEqual({ status: "paid", amount_paid_cent: 6_000, paid_at: PAID_AT });
    expect(fullState(creditNoteFirst.invoiceId)).toEqual(fullState(paymentFirst.invoiceId));
  });

  it("stays partial when the credit note and the payments still leave something open", async () => {
    const { invoiceId, creditNoteId } = originalWithDraftCreditNote(1_000);
    await addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 6_000 });

    await issueInvoice(creditNoteId);

    expect(invoiceState(invoiceId)).toEqual({ status: "partial", amount_paid_cent: 6_000 });
  });

  it("stays sent when a credit note is issued on an unpaid invoice", async () => {
    const { invoiceId, creditNoteId } = originalWithDraftCreditNote(INVOICE_TOTAL);

    await issueInvoice(creditNoteId);

    expect(invoiceState(invoiceId)).toEqual({ status: "sent", amount_paid_cent: 0 });
  });

  it("falls back to partial when the issued credit note is reopened as a draft", async () => {
    const { invoiceId, creditNoteId } = originalWithDraftCreditNote(4_000);
    await addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 6_000 });
    await issueInvoice(creditNoteId);

    await reopenDraft(creditNoteId);

    expect(fullState(invoiceId)).toEqual({ status: "partial", amount_paid_cent: 6_000, paid_at: null });
  });

  it("lets the only payment of an invoice settled by a credit note be deleted, which makes it unpaid again", async () => {
    const { invoiceId, creditNoteId } = originalWithDraftCreditNote(4_000);
    await addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 6_000 });
    await issueInvoice(creditNoteId);
    const [payment] = await listPayments(invoiceId);

    await deletePayment(payment.id);

    expect(fullState(invoiceId)).toEqual({ status: "sent", amount_paid_cent: 0, paid_at: null });
  });

  it("derives the status again when one of two payments of a fully credited invoice is deleted", async () => {
    const { invoiceId, creditNoteId } = originalWithDraftCreditNote(INVOICE_TOTAL);
    await addPayment({ invoiceId, paidAt: PAID_AT, amountCent: 5_000 });
    await addPayment({ invoiceId, paidAt: PAID_AT + 1, amountCent: 5_000 });
    await issueInvoice(creditNoteId);
    const [first] = await listPayments(invoiceId);

    await deletePayment(first.id);

    expect(fullState(invoiceId)).toEqual({ status: "paid", amount_paid_cent: 5_000, paid_at: PAID_AT + 1 });
  });
});

describe("a credit note in another currency than its invoice", () => {
  it("is ignored: nothing is credited and the invoice stays payable", async () => {
    const invoiceId = invoiceWithCreditNote(-TOTAL);
    sqlite.current!.prepare("UPDATE invoices SET currency = 'USD' WHERE is_credit_note = 1").run();

    expect(await listed(invoiceId)).toMatchObject({ creditedCent: 0, settledByCreditNote: false });
    await markPaid(invoiceId, PAID_AT);
    expect(invoiceState(invoiceId)).toEqual({ status: "paid", amount_paid_cent: TOTAL });
  });
});

describe("the currency of a credit note", () => {
  const FOREIGN_RATE = "1.0832";

  function creditNoteForm(correctsInvoiceId: number, terms: Pick<InvoiceFormInput, "currency" | "exchangeRate">): InvoiceFormInput {
    return {
      customerId: 1,
      issueDate: PAID_AT,
      deliveryDate: null,
      dueDate: PAID_AT,
      notes: null,
      paymentTerms: null,
      reverseChargeType: "none",
      supplyKind: "services",
      isCreditNote: true,
      correctsInvoiceId,
      items: [{ description: "Beratung", quantity: 1, unit: "h", unitPrice: 5_000, vatRate: 19 }],
      ...terms,
    };
  }

  async function storedTerms(invoiceId: number) {
    const { invoice } = (await getInvoice(invoiceId))!;
    return { currency: invoice.currency, exchangeRate: invoice.exchangeRate };
  }

  it("follows the original on creation, whatever the caller passes", async () => {
    const eurInvoiceId = seedInvoice("RE-2026-0100", TOTAL);
    const usdInvoiceId = seedInvoice("RE-2026-0101", TOTAL);
    sqlite.current!.prepare("UPDATE invoices SET currency = 'USD', exchange_rate = ? WHERE id = ?").run(FOREIGN_RATE, usdInvoiceId);

    const eurCreditNote = await createInvoice(creditNoteForm(eurInvoiceId, { currency: "USD", exchangeRate: "2" }));
    const usdCreditNote = await createInvoice(creditNoteForm(usdInvoiceId, { currency: "EUR", exchangeRate: null }));

    expect(await storedTerms(eurCreditNote)).toEqual({ currency: "EUR", exchangeRate: null });
    expect(await storedTerms(usdCreditNote)).toEqual({ currency: "USD", exchangeRate: FOREIGN_RATE });
  });

  it("cannot be changed by editing the draft", async () => {
    const invoiceId = seedInvoice("RE-2026-0102", TOTAL);
    const creditNoteId = await createInvoice(creditNoteForm(invoiceId, {}));

    await updateInvoice(creditNoteId, creditNoteForm(invoiceId, { currency: "GBP", exchangeRate: "0.85" }));

    expect(await storedTerms(creditNoteId)).toEqual({ currency: "EUR", exchangeRate: null });
  });
});
