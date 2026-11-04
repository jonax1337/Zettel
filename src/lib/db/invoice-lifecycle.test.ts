import { describe, expect, it } from "vitest";
// @ts-expect-error The project has no @types/node; node:sqlite is only used to run the real SQL in tests.
import { DatabaseSync } from "node:sqlite";
import {
  canCancelInvoice,
  canCreateCreditNote,
  canDeleteInvoice,
  canReopenInvoice,
  invoiceIdsSettledByCreditNote,
  isIssuedCreditNote,
  notSettledByCreditNoteSql,
  settledByCreditNoteSql,
} from "./invoice-lifecycle";
import type { InvoiceStatus } from "./schema";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[]; run(...bindings: (string | number)[]): unknown };
};

const DRAFT_NUMBER = "DRAFT-1a2b3c";
const REAL_NUMBER = "RE-2026-0001";
const ALL_STATUSES: InvoiceStatus[] = ["draft", "sent", "partial", "paid", "cancelled"];

describe("canDeleteInvoice", () => {
  it.each(ALL_STATUSES)("allows deleting a %s invoice that never got a real number", (status) => {
    expect(canDeleteInvoice({ number: DRAFT_NUMBER, status })).toBe(true);
  });

  it.each(ALL_STATUSES)("forbids deleting a numbered %s invoice", (status) => {
    expect(canDeleteInvoice({ number: REAL_NUMBER, status })).toBe(false);
  });
});

describe("canCancelInvoice", () => {
  it("allows discarding an unnumbered draft", () => {
    expect(canCancelInvoice({ number: DRAFT_NUMBER, status: "draft" })).toBe(true);
  });

  it("forbids discarding a reopened draft that keeps its number", () => {
    expect(canCancelInvoice({ number: REAL_NUMBER, status: "draft" })).toBe(false);
  });

  it.each(["sent", "partial", "paid", "cancelled"] as const)("forbids cancelling a %s invoice", (status) => {
    expect(canCancelInvoice({ number: REAL_NUMBER, status })).toBe(false);
  });
});

describe("canReopenInvoice", () => {
  const clean = { paymentCount: 0, hasCreditNote: false };

  it("allows reopening a sent invoice without payments or credit note", () => {
    expect(canReopenInvoice({ number: REAL_NUMBER, status: "sent" }, clean)).toBe(true);
  });

  it("forbids reopening once a payment was booked", () => {
    expect(canReopenInvoice({ number: REAL_NUMBER, status: "sent" }, { ...clean, paymentCount: 1 })).toBe(false);
  });

  it("forbids reopening an invoice that has a credit note", () => {
    const facts = { ...clean, hasCreditNote: true };
    expect(canReopenInvoice({ number: REAL_NUMBER, status: "sent" }, facts)).toBe(false);
  });

  it.each(["draft", "partial", "paid"] as const)("forbids reopening a %s invoice", (status) => {
    expect(canReopenInvoice({ number: REAL_NUMBER, status }, clean)).toBe(false);
  });

  it("allows picking up a discarded unnumbered draft, but not a cancelled numbered invoice", () => {
    expect(canReopenInvoice({ number: DRAFT_NUMBER, status: "cancelled" }, clean)).toBe(true);
    expect(canReopenInvoice({ number: REAL_NUMBER, status: "cancelled" }, clean)).toBe(false);
  });
});

describe("canCreateCreditNote", () => {
  it.each(["sent", "partial", "paid"] as const)("allows a credit note for a %s invoice", (status) => {
    expect(canCreateCreditNote({ status, isCreditNote: false })).toBe(true);
  });

  it.each(["draft", "cancelled"] as const)("forbids a credit note for a %s invoice", (status) => {
    expect(canCreateCreditNote({ status, isCreditNote: false })).toBe(false);
  });

  it("forbids a credit note for a credit note", () => {
    expect(canCreateCreditNote({ status: "sent", isCreditNote: true })).toBe(false);
  });
});

describe("credit note settlement", () => {
  const creditNote = (status: InvoiceStatus, correctsInvoiceId: number | null = 1) => ({
    isCreditNote: true,
    status,
    correctsInvoiceId,
  });

  it.each(["sent", "partial", "paid"] as const)("counts a %s credit note as issued", (status) => {
    expect(isIssuedCreditNote(creditNote(status))).toBe(true);
  });

  it.each(["draft", "cancelled"] as const)("does not count a %s credit note as issued", (status) => {
    expect(isIssuedCreditNote(creditNote(status))).toBe(false);
  });

  it("collects the invoices that issued credit notes correct", () => {
    const invoices = [
      { isCreditNote: false, status: "sent" as const, correctsInvoiceId: null },
      creditNote("sent", 1),
      creditNote("draft", 2),
      creditNote("paid", null),
    ];
    expect([...invoiceIdsSettledByCreditNote(invoices)]).toEqual([1]);
  });

  it("settles the whole invoice even when the credit note refunds only part of it", () => {
    const original = { id: 1, isCreditNote: false, status: "sent" as const, correctsInvoiceId: null, total: 10_000 };
    const partialRefund = { ...creditNote("sent", 1), total: -2_500 };

    expect(invoiceIdsSettledByCreditNote([original, partialRefund]).has(1)).toBe(true);
  });
});

describe("settledByCreditNoteSql", () => {
  function settledIdsInSql(creditNotes: { status: InvoiceStatus; correctsInvoiceId: number }[]): number[] {
    const db = new DatabaseSync(":memory:") as SqliteDatabase;
    db.exec("CREATE TABLE invoices (id INTEGER PRIMARY KEY, status TEXT, is_credit_note INTEGER, corrects_invoice_id INTEGER)");
    db.exec("INSERT INTO invoices (id, status, is_credit_note) VALUES (1, 'sent', 0), (2, 'sent', 0)");
    const insert = db.prepare("INSERT INTO invoices (status, is_credit_note, corrects_invoice_id) VALUES (?, 1, ?)");
    for (const note of creditNotes) insert.run(note.status, note.correctsInvoiceId);
    const settled = db
      .prepare(`SELECT i.id FROM invoices i WHERE i.is_credit_note = 0 AND ${settledByCreditNoteSql("i")} ORDER BY i.id`)
      .all() as { id: number }[];
    const open = db
      .prepare(`SELECT i.id FROM invoices i WHERE i.is_credit_note = 0 AND ${notSettledByCreditNoteSql("i")}`)
      .all() as { id: number }[];
    expect(settled.length + open.length).toBe(2);
    return settled.map((row) => row.id);
  }

  it.each(["sent", "partial", "paid"] as const)("counts an invoice with a %s credit note as settled", (status) => {
    expect(settledIdsInSql([{ status, correctsInvoiceId: 1 }])).toEqual([1]);
  });

  it.each(["draft", "cancelled"] as const)("keeps an invoice with a %s credit note open", (status) => {
    expect(settledIdsInSql([{ status, correctsInvoiceId: 1 }])).toEqual([]);
  });
});
