import { describe, expect, it } from "vitest";
// @ts-expect-error The project has no @types/node; node:sqlite is only used to run the real SQL in tests.
import { DatabaseSync } from "node:sqlite";
import {
  canCancelInvoice,
  canCreateCreditNote,
  canDeleteInvoice,
  canReopenInvoice,
  creditedCentOf,
  creditedCentSql,
  isIssuedCreditNote,
  isSettledByCreditNote,
  notSettledByCreditNoteSql,
  openBalanceCent,
  settledByCreditNoteSql,
} from "./invoice-lifecycle";
import type { InvoiceStatus } from "./schema";

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { all(): unknown[]; run(...bindings: (string | number | null)[]): unknown };
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
  const creditNote = (status: InvoiceStatus, total = -11_900) => ({ isCreditNote: true, status, total });

  it.each(["sent", "partial", "paid"] as const)("counts a %s credit note as issued", (status) => {
    expect(isIssuedCreditNote(creditNote(status))).toBe(true);
  });

  it.each(["draft", "cancelled"] as const)("does not count a %s credit note as issued", (status) => {
    expect(isIssuedCreditNote(creditNote(status))).toBe(false);
  });

  it("credits the absolute total of an issued credit note", () => {
    expect(creditedCentOf(creditNote("sent", -3_000))).toBe(3_000);
  });

  it.each(["draft", "cancelled"] as const)("credits nothing for a %s credit note or none at all", (status) => {
    expect(creditedCentOf(creditNote(status))).toBe(0);
    expect(creditedCentOf(null)).toBe(0);
  });

  it("subtracts payments and issued credit notes from the absolute total", () => {
    expect(openBalanceCent({ total: 11_900, amountPaidCent: 5_000, creditedCent: 3_000 })).toBe(3_900);
    expect(openBalanceCent({ total: -11_900, amountPaidCent: 0, creditedCent: 0 })).toBe(11_900);
  });

  it("settles an invoice that a credit note reverses in full", () => {
    expect(isSettledByCreditNote({ total: 11_900, amountPaidCent: 0, creditedCent: 11_900 })).toBe(true);
  });

  it("leaves the remainder of a partially credited invoice open", () => {
    expect(isSettledByCreditNote({ total: 11_900, amountPaidCent: 0, creditedCent: 3_000 })).toBe(false);
  });

  it("settles once payments and a partial credit note together cover the total", () => {
    expect(isSettledByCreditNote({ total: 11_900, amountPaidCent: 8_900, creditedCent: 3_000 })).toBe(true);
    expect(isSettledByCreditNote({ total: 11_900, amountPaidCent: 8_899, creditedCent: 3_000 })).toBe(false);
  });

  it("does not call a fully paid invoice without credit note settled by one", () => {
    expect(isSettledByCreditNote({ total: 11_900, amountPaidCent: 11_900, creditedCent: 0 })).toBe(false);
  });
});

describe("credit note settlement in SQL", () => {
  type CreditNoteSeed = { status: InvoiceStatus; total: number };

  /** Invoice 1 (total 119,00 €, `paidCent` paid) with the given credit notes; invoice 2 is untouched. */
  function seed(creditNotes: CreditNoteSeed[], paidCent = 0): SqliteDatabase {
    const db = new DatabaseSync(":memory:") as SqliteDatabase;
    db.exec(`CREATE TABLE invoices (id INTEGER PRIMARY KEY, status TEXT, total INTEGER,
      amount_paid_cent INTEGER, is_credit_note INTEGER, corrects_invoice_id INTEGER)`);
    db.prepare("INSERT INTO invoices (id, status, total, amount_paid_cent, is_credit_note) VALUES (1, 'sent', 11900, ?, 0)").run(paidCent);
    db.exec("INSERT INTO invoices (id, status, total, amount_paid_cent, is_credit_note) VALUES (2, 'sent', 11900, 0, 0)");
    const insert = db.prepare("INSERT INTO invoices (status, total, is_credit_note, corrects_invoice_id) VALUES (?, ?, 1, 1)");
    for (const note of creditNotes) insert.run(note.status, note.total);
    return db;
  }

  function settledIds(db: SqliteDatabase): number[] {
    const settled = db
      .prepare(`SELECT i.id FROM invoices i WHERE i.is_credit_note = 0 AND ${settledByCreditNoteSql("i")} ORDER BY i.id`)
      .all() as { id: number }[];
    const open = db
      .prepare(`SELECT i.id FROM invoices i WHERE i.is_credit_note = 0 AND ${notSettledByCreditNoteSql("i")}`)
      .all() as { id: number }[];
    expect(settled.length + open.length).toBe(2);
    return settled.map((row) => row.id);
  }

  function creditedCent(db: SqliteDatabase): number {
    const [row] = db.prepare(`SELECT ${creditedCentSql("i")} AS c FROM invoices i WHERE i.id = 1`).all() as { c: number }[];
    return row.c;
  }

  it.each(["sent", "partial", "paid"] as const)("counts an invoice with a full %s credit note as settled", (status) => {
    expect(settledIds(seed([{ status, total: -11_900 }]))).toEqual([1]);
  });

  it.each(["draft", "cancelled"] as const)("keeps an invoice with a %s credit note open and credits nothing", (status) => {
    const db = seed([{ status, total: -11_900 }]);

    expect(settledIds(db)).toEqual([]);
    expect(creditedCent(db)).toBe(0);
  });

  it("keeps a partially credited invoice open", () => {
    const db = seed([{ status: "sent", total: -3_000 }]);

    expect(settledIds(db)).toEqual([]);
    expect(creditedCent(db)).toBe(3_000);
  });

  it("settles once payments and the partial credit note cover the total", () => {
    expect(settledIds(seed([{ status: "sent", total: -3_000 }], 8_900))).toEqual([1]);
    expect(settledIds(seed([{ status: "sent", total: -3_000 }], 5_000))).toEqual([]);
  });

  it("sums several issued credit notes and ignores draft and cancelled ones", () => {
    const db = seed([
      { status: "sent", total: -3_000 },
      { status: "paid", total: -2_000 },
      { status: "draft", total: -6_900 },
      { status: "cancelled", total: -6_900 },
    ]);

    expect(creditedCent(db)).toBe(5_000);
    expect(settledIds(db)).toEqual([]);
  });
});