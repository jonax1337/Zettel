import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...db,
}));
vi.mock("./seals", () => ({ appendSeal: vi.fn() }));
vi.mock("./queries", () => ({
  SETTINGS_DEFAULTS: { invoiceNumberFormat: "RE-{YYYY}-{NNNN}" },
  loadSettings: vi.fn(async () => ({ isKleinunternehmer: false, defaultPdfLanguage: "de" })),
  getCustomer: vi.fn(async (id: number) => ({
    id,
    customerNumber: "K-0001",
    name: "Acme",
    contactPerson: null,
    street: "Weg 1",
    postalCode: "10115",
    city: "Berlin",
    country: "DE",
    email: null,
    vatId: null,
    leitwegId: "04011000-1234512345-35",
  })),
}));

import {
  buildInvoiceFilter,
  cancelInvoice,
  createCreditNoteFromInvoice,
  createInvoice,
  creditNoteInputFor,
  deleteInvoice,
  displayInvoiceNumber,
  getInvoiceYears,
  isDraftNumber,
  issueInvoice,
  markPaid,
  recordGeneratedPdf,
  recordInvoiceValidation,
  reopenDraft,
  updateInvoice,
  type InvoiceFormInput,
} from "./invoices";
import type { InvoiceRow } from "./invoice-rows";
import { appendSeal } from "./seals";
import { mapInvoice, mapItem, type InvoiceItemRow } from "./invoice-rows";

function invoiceRow(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 7,
    number: "RE-2026-0001",
    customer_id: 3,
    customer_snapshot: "{}",
    issue_date: 1_700_000_000,
    delivery_date: null,
    due_date: 1_700_000_000,
    status: "sent",
    subtotal: 10_000,
    vat_amount: 0,
    total: 10_000,
    is_kleinunternehmer: 0,
    is_reverse_charge: 0,
    reverse_charge_type: null,
    supply_kind: "goods",
    notes: null,
    payment_terms: null,
    pdf_path: null,
    is_credit_note: 0,
    corrects_invoice_id: null,
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
    sent_at: null,
    paid_at: null,
    last_validation_status: null,
    last_validated_at: null,
    last_validation_findings_count: null,
    currency: "EUR",
    exchange_rate: null,
    eur_total_cent: null,
    notes_internal: null,
    follow_up_date: null,
    service_period_start: null,
    service_period_end: null,
    skonto_percent: null,
    skonto_days: null,
    amount_paid_cent: 0,
    pdf_language: "de",
    buyer_reference: null,
    ...overrides,
  };
}

const itemRow: InvoiceItemRow = {
  id: 1,
  invoice_id: 7,
  position: 1,
  description: "Arbeit",
  quantity: 2,
  unit: "Std",
  unit_price: 5_000,
  vat_rate: 0,
  line_total: 10_000,
  long_description: null,
  line_period_start: null,
  line_period_end: null,
};

/** Maps `col = ?` assignments (UPDATE) to their bound values. */
function boundAssignments(sql: string, binds: unknown[]): Record<string, unknown> {
  const columns = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
  return Object.fromEntries(columns.map((column, i) => [column, binds[i]]));
}

/** Maps the INSERT column list to bound values; `status` is a SQL literal, not bound. */
function boundInsertColumns(sql: string, binds: unknown[]): Record<string, unknown> {
  const columnList = /\(([^)]+)\)\s+VALUES/.exec(sql)![1];
  const columns = columnList.split(",").map((c) => c.trim()).filter((c) => c !== "status");
  return Object.fromEntries(columns.map((column, i) => [column, binds[i]]));
}

const formInput: InvoiceFormInput = {
  customerId: 3,
  issueDate: 1_700_000_000,
  deliveryDate: null,
  dueDate: 1_700_000_000,
  notes: null,
  paymentTerms: null,
  reverseChargeType: "none",
  supplyKind: "services",
  items: [{ description: "Arbeit", quantity: 1, unit: "Std", unitPrice: 10_000, vatRate: 0 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.execute.mockResolvedValue({ rowsAffected: 1 });
  db.insert.mockResolvedValue(99);
});

describe("draft numbers", () => {
  it("recognizes the DRAFT- placeholder", () => {
    expect(isDraftNumber("DRAFT-abcdef")).toBe(true);
    expect(isDraftNumber("RE-2026-0001")).toBe(false);
    expect(isDraftNumber(null)).toBe(false);
  });

  it("shows only drafts as 'Entwurf #<4 chars>'", () => {
    expect(displayInvoiceNumber({ number: "DRAFT-1a2b3c4d5e", status: "draft" })).toBe(
      "Entwurf #1a2b",
    );
    expect(displayInvoiceNumber({ number: "DRAFT-1a2b3c4d5e", status: "sent" })).toBe(
      "DRAFT-1a2b3c4d5e",
    );
    expect(displayInvoiceNumber({ number: "RE-2026-0001", status: "draft" })).toBe("RE-2026-0001");
  });
});

describe("buildInvoiceFilter", () => {
  it("returns no WHERE clause for an empty or 'all' filter", () => {
    expect(buildInvoiceFilter({})).toEqual({ where: "", binds: [] });
    expect(buildInvoiceFilter({ status: "all", year: "all", customerId: "all", search: "  " })).toEqual({
      where: "",
      binds: [],
    });
  });

  it("combines status, customer, year range and trimmed search with AND", () => {
    const { where, binds } = buildInvoiceFilter({
      status: "paid",
      customerId: 4,
      year: 2026,
      search: " acme ",
    });
    expect(where).toBe(
      "WHERE i.status = ? AND i.customer_id = ? AND i.issue_date >= ? AND i.issue_date < ? AND (i.number LIKE ? OR c.name LIKE ?)",
    );
    expect(binds).toEqual([
      "paid",
      4,
      new Date(2026, 0, 1).getTime() / 1000,
      new Date(2027, 0, 1).getTime() / 1000,
      "%acme%",
      "%acme%",
    ]);
  });
});

describe("getInvoiceYears", () => {
  it("groups by local year, matching the local-time year filter of the list", async () => {
    db.select.mockResolvedValue([{ y: 2026 }, { y: 2025 }]);

    await expect(getInvoiceYears()).resolves.toEqual([2026, 2025]);

    expect(db.select.mock.calls[0][0]).toContain("'localtime'");
  });
});

describe("credit notes", () => {
  const usdInvoice = mapInvoice(
    invoiceRow({ currency: "USD", exchange_rate: "1,08", eur_total_cent: 9_259, total: 10_000 }),
  );
  const items = [mapItem(itemRow)];

  function creditNoteSql(original: InvoiceRow, originalItems: InvoiceItemRow[] = [itemRow]) {
    return async (sql: string) => {
      if (sql.includes("FROM invoice_items")) return originalItems;
      if (sql.includes("corrects_invoice_id")) return [];
      return [original];
    };
  }

  it("carries the foreign-currency terms of the original into the credit note input", () => {
    const input = creditNoteInputFor(usdInvoice, items, 1_800_000_000);

    expect(input).toMatchObject({
      currency: "USD",
      exchangeRate: "1,08",
      isCreditNote: true,
      correctsInvoiceId: 7,
      issueDate: 1_800_000_000,
      dueDate: 1_800_000_000,
    });
  });

  it("stores a credit note of a USD invoice in USD with negative amounts and negative EUR total", async () => {
    db.select.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM invoice_items")) return [itemRow];
      if (sql.includes("corrects_invoice_id")) return [];
      return [invoiceRow({ currency: "USD", exchange_rate: "1,08", eur_total_cent: 9_259 })];
    });

    await createCreditNoteFromInvoice(7);

    const [sql, binds] = db.insert.mock.calls[0];
    expect(boundInsertColumns(sql, binds)).toMatchObject({
      currency: "USD",
      exchange_rate: "1,08",
      eur_total_cent: -9_259,
      total: -10_000,
      is_credit_note: 1,
      corrects_invoice_id: 7,
    });
  });

  it("carries the supply kind of the original into the credit note", async () => {
    const original = mapInvoice(invoiceRow({ reverse_charge_type: "intra_eu", supply_kind: "services" }));
    expect(creditNoteInputFor(original, items, 1_800_000_000).supplyKind).toBe("services");

    db.select.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM invoice_items")) return [itemRow];
      if (sql.includes("corrects_invoice_id")) return [];
      return [invoiceRow({ reverse_charge_type: "intra_eu", supply_kind: "goods" })];
    });
    await createCreditNoteFromInvoice(7);

    const [sql, binds] = db.insert.mock.calls[0];
    expect(boundInsertColumns(sql, binds)).toMatchObject({ supply_kind: "goods" });
  });

  it("refuses to cancel a credit note", async () => {
    db.select.mockImplementation(async (sql: string) =>
      sql.includes("invoice_items") ? [] : [invoiceRow({ is_credit_note: 1, total: -10_000 })],
    );

    await expect(createCreditNoteFromInvoice(7)).rejects.toThrow("Stornorechnung");
  });

  it("derives the EUR total of a partial refund from the credit note's own total", async () => {
    const halfRefund = { ...itemRow, quantity: 1, line_total: 5_000 };
    db.select.mockImplementation(
      creditNoteSql(invoiceRow({ currency: "USD", exchange_rate: "1,08", eur_total_cent: 9_259 }), [halfRefund]),
    );

    await createCreditNoteFromInvoice(7);

    const [sql, binds] = db.insert.mock.calls[0];
    expect(boundInsertColumns(sql, binds)).toMatchObject({ total: -5_000, eur_total_cent: -4_630 });
  });

  it("keeps the Kleinunternehmer treatment of the original although the setting changed since", async () => {
    const vatItem = { ...itemRow, vat_rate: 19 };
    db.select.mockImplementation(creditNoteSql(invoiceRow({ is_kleinunternehmer: 1 }), [vatItem]));

    await createCreditNoteFromInvoice(7);

    const [sql, binds] = db.insert.mock.calls[0];
    expect(boundInsertColumns(sql, binds)).toMatchObject({ is_kleinunternehmer: 1, total: -10_000 });
  });

  it("can cancel a partially paid invoice", async () => {
    db.select.mockImplementation(creditNoteSql(invoiceRow({ status: "partial", amount_paid_cent: 4_000 })));

    await createCreditNoteFromInvoice(7);

    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("ignores a discarded credit note draft when checking for an existing one", async () => {
    db.select.mockImplementation(creditNoteSql(invoiceRow()));

    await createCreditNoteFromInvoice(7);

    const lookup = db.select.mock.calls.find(([sql]) => String(sql).includes("corrects_invoice_id"))!;
    expect(lookup[0]).toContain("status != 'cancelled'");
  });
});

describe("createInvoice", () => {
  it("freezes the EUR total of a foreign-currency invoice when the caller sends none", async () => {
    await createInvoice({ ...formInput, currency: "USD", exchangeRate: "1,08" });

    const [sql, binds] = db.insert.mock.calls[0];
    expect(boundInsertColumns(sql, binds)).toMatchObject({ currency: "USD", eur_total_cent: 9_259 });
  });

  it("leaves the EUR total of a EUR invoice to the caller", async () => {
    await createInvoice(formInput);

    const [sql, binds] = db.insert.mock.calls[0];
    expect(boundInsertColumns(sql, binds)).toMatchObject({ eur_total_cent: null });
  });
});

describe("buyer reference", () => {
  const items = [mapItem(itemRow)];

  function insertedBuyerReference(): unknown {
    const [sql, binds] = db.insert.mock.calls[0];
    return boundInsertColumns(sql, binds).buyer_reference;
  }

  it("is read from the stored row", () => {
    expect(mapInvoice(invoiceRow({ buyer_reference: "04011000-1234512345-35" })).buyerReference).toBe(
      "04011000-1234512345-35",
    );
    expect(mapInvoice(invoiceRow()).buyerReference).toBeNull();
  });

  it("is copied from the customer's Leitweg-ID when the caller sends none", async () => {
    await createInvoice(formInput);

    expect(insertedBuyerReference()).toBe("04011000-1234512345-35");
  });

  it("keeps a value the caller sends, trimmed, over the customer's", async () => {
    await createInvoice({ ...formInput, buyerReference: "  991-0815-12  " });

    expect(insertedBuyerReference()).toBe("991-0815-12");
  });

  it("stays empty when the caller clears it, whatever the customer has", async () => {
    await createInvoice({ ...formInput, buyerReference: "" });

    expect(insertedBuyerReference()).toBeNull();
  });

  it("is carried from the original into the credit note input", () => {
    const original = mapInvoice(invoiceRow({ buyer_reference: "991-0815-12" }));

    expect(creditNoteInputFor(original, items, 1_800_000_000).buyerReference).toBe("991-0815-12");
  });

  it("is not replaced by the customer's current Leitweg-ID in a stored credit note", async () => {
    db.select.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM invoice_items")) return [itemRow];
      if (sql.includes("corrects_invoice_id")) return [];
      return [invoiceRow({ buyer_reference: null })];
    });

    await createCreditNoteFromInvoice(7);

    expect(insertedBuyerReference()).toBeNull();
  });
});

describe("supply kind", () => {
  it("is read from the stored row", () => {
    expect(mapInvoice(invoiceRow({ supply_kind: "services" })).supplyKind).toBe("services");
    expect(mapInvoice(invoiceRow({ supply_kind: "goods" })).supplyKind).toBe("goods");
  });

  it.each(["goods", "services"] as const)("is stored on create: %s", async (supplyKind) => {
    await createInvoice({ ...formInput, reverseChargeType: "intra_eu", supplyKind });

    const [sql, binds] = db.insert.mock.calls[0];
    expect(boundInsertColumns(sql, binds)).toMatchObject({ supply_kind: supplyKind });
  });

  it.each(["goods", "services"] as const)("is stored on update: %s", async (supplyKind) => {
    db.select.mockResolvedValue([invoiceRow({ status: "draft", supply_kind: "goods" })]);

    await updateInvoice(7, { ...formInput, reverseChargeType: "intra_eu", supplyKind });

    const call = db.execute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE invoices"))!;
    expect(boundAssignments(call[0], call[1])).toMatchObject({ supply_kind: supplyKind });
  });
});

describe("updateInvoice", () => {
  beforeEach(() => {
    db.select.mockResolvedValue([
      invoiceRow({
        status: "draft",
        currency: "USD",
        exchange_rate: "1,08",
        notes_internal: "intern",
        follow_up_date: 1_750_000_000,
      }),
    ]);
  });

  function updateBinds(): Record<string, unknown> {
    const call = db.execute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE invoices"))!;
    return boundAssignments(call[0], call[1]);
  }

  it("keeps the stored buyer reference the form does not send and replaces it when it does", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "draft", buyer_reference: "991-0815-12" })]);

    await updateInvoice(7, formInput);
    expect(updateBinds()).toMatchObject({ buyer_reference: "991-0815-12" });

    db.execute.mockClear();
    await updateInvoice(7, { ...formInput, buyerReference: " 04011000-1234512345-35 " });
    expect(updateBinds()).toMatchObject({ buyer_reference: "04011000-1234512345-35" });

    db.execute.mockClear();
    await updateInvoice(7, { ...formInput, buyerReference: null });
    expect(updateBinds()).toMatchObject({ buyer_reference: null });
  });

  it("clears the exchange rate when the invoice is switched back to EUR", async () => {
    await updateInvoice(7, { ...formInput, currency: "EUR", exchangeRate: null, eurTotalCent: 10_000 });

    expect(updateBinds()).toMatchObject({ currency: "EUR", exchange_rate: null });
  });

  it("keeps internal notes, follow-up date and exchange rate the form does not send", async () => {
    await updateInvoice(7, formInput);

    expect(updateBinds()).toMatchObject({
      currency: "USD",
      exchange_rate: "1,08",
      notes_internal: "intern",
      follow_up_date: 1_750_000_000,
    });
  });

  it("clears the frozen EUR total when the form sends null, e.g. the exchange rate was removed", async () => {
    db.select.mockResolvedValue([
      invoiceRow({ status: "draft", currency: "USD", exchange_rate: "1,08", eur_total_cent: 9_259 }),
    ]);

    await updateInvoice(7, { ...formInput, currency: "USD", exchangeRate: null, eurTotalCent: null });

    expect(updateBinds()).toMatchObject({ eur_total_cent: null });
  });

  it("keeps the frozen EUR total when the form does not send one", async () => {
    db.select.mockResolvedValue([
      invoiceRow({ status: "draft", currency: "USD", exchange_rate: "1,08", eur_total_cent: 9_259 }),
    ]);

    await updateInvoice(7, formInput);

    expect(updateBinds()).toMatchObject({ eur_total_cent: 9_259 });
  });

  it("stores the EUR total of a credit note negated", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "draft", is_credit_note: 1 })]);

    await updateInvoice(7, { ...formInput, eurTotalCent: 10_000 });

    expect(updateBinds()).toMatchObject({ eur_total_cent: -10_000 });
  });

  it("rejects editing a sent invoice", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "sent" })]);

    await expect(updateInvoice(7, formInput)).rejects.toThrow("Nur Entwürfe");
  });

  it("refreshes the customer snapshot of a draft even when the customer stays the same", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "draft", customer_snapshot: '{"name":"Alt"}' })]);

    await updateInvoice(7, formInput);

    expect(JSON.parse(String(updateBinds().customer_snapshot))).toMatchObject({ name: "Acme" });
  });
});

describe("issueInvoice", () => {
  const draftRow = invoiceRow({ status: "draft", number: "DRAFT-abc" });
  const counterDraws = () =>
    db.select.mock.calls.filter(([sql]) => String(sql).includes("invoice_number_counter"));
  const claim = () => db.execute.mock.calls.find(([sql]) => String(sql).includes("status = 'sent'"))!;

  it("claims the draft, then draws the real number for a DRAFT- placeholder", async () => {
    db.select
      .mockResolvedValueOnce([draftRow])
      .mockResolvedValueOnce([{ counter: 12, format: "RE-{NNNN}" }]);

    const number = await issueInvoice(7, 1_750_000_000);

    expect(number).toBe("RE-0012");
    expect(claim()[0]).toContain("WHERE id = ? AND status = 'draft'");
    const assign = db.execute.mock.calls.find(([sql]) => String(sql).includes("SET number = ?"))!;
    expect(assign[1]).toEqual(["RE-0012", 7]);
  });

  it("seals the invoice once it has its final number", async () => {
    db.select
      .mockResolvedValueOnce([draftRow])
      .mockResolvedValueOnce([{ counter: 12, format: "RE-{NNNN}" }]);

    await issueInvoice(7);

    expect(appendSeal).toHaveBeenCalledExactlyOnceWith(7, "issue");
    expect(vi.mocked(appendSeal).mock.invocationCallOrder[0]).toBeGreaterThan(
      db.execute.mock.invocationCallOrder[db.execute.mock.calls.findIndex(([sql]) => String(sql).includes("SET number = ?"))],
    );
  });

  it("stays issued when sealing fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(appendSeal).mockRejectedValueOnce(new Error("disk full"));
    db.select.mockResolvedValueOnce([invoiceRow({ status: "draft", number: "RE-2026-0009" })]);

    expect(await issueInvoice(7)).toBe("RE-2026-0009");
  });

  it("freezes the customer's current master data when issuing", async () => {
    db.select
      .mockResolvedValueOnce([invoiceRow({ status: "draft", number: "RE-2026-0009", customer_snapshot: "{}" })]);

    await issueInvoice(7, 1_750_000_000);

    const [, binds] = claim();
    expect(binds[0]).toBe(1_750_000_000);
    expect(JSON.parse(String(binds[1]))).toMatchObject({ name: "Acme" });
  });

  it("keeps an already assigned number without touching the counter", async () => {
    db.select.mockResolvedValueOnce([invoiceRow({ status: "draft", number: "RE-2026-0009" })]);

    expect(await issueInvoice(7)).toBe("RE-2026-0009");
    expect(counterDraws()).toHaveLength(0);
  });

  it("does not draw a second number when a concurrent click already issued the invoice", async () => {
    db.select
      .mockResolvedValueOnce([draftRow])
      .mockResolvedValueOnce([invoiceRow({ status: "sent", number: "RE-2026-0012" })]);
    db.execute.mockResolvedValueOnce({ rowsAffected: 0 });

    expect(await issueInvoice(7)).toBe("RE-2026-0012");
    expect(counterDraws()).toHaveLength(0);
  });

  it("asks to retry while the concurrent issue has not assigned the number yet", async () => {
    db.select
      .mockResolvedValueOnce([draftRow])
      .mockResolvedValueOnce([invoiceRow({ status: "sent", number: "DRAFT-abc" })]);
    db.execute.mockResolvedValueOnce({ rowsAffected: 0 });

    await expect(issueInvoice(7)).rejects.toThrow("gerade ausgestellt");
  });

  it("returns the invoice to draft when no number could be drawn", async () => {
    db.select
      .mockResolvedValueOnce([draftRow])
      .mockRejectedValueOnce(new Error("database is locked"));

    await expect(issueInvoice(7)).rejects.toThrow("database is locked");

    const revert = db.execute.mock.calls.at(-1)!;
    expect(revert[0]).toContain("status = 'draft'");
  });
});

describe("validation recording", () => {
  it("stores the validation outcome of an invoice", async () => {
    await recordInvoiceValidation(7, "invalid", 3);

    const [sql, binds] = db.execute.mock.calls[0];
    expect(sql).toContain("last_validation_status = ?");
    expect(binds).toEqual(["invalid", 3, 7]);
  });

  it("stores the PDF path together with its validation outcome", async () => {
    await recordGeneratedPdf(7, "/pdf/RE-1.pdf", "unavailable", null);

    const [sql, binds] = db.execute.mock.calls[0];
    expect(sql).toContain("pdf_path = ?");
    expect(binds).toEqual(["/pdf/RE-1.pdf", "unavailable", null, 7]);
  });
});

describe("markPaid", () => {
  const insertedPayments = () =>
    db.execute.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO invoice_payments"));

  function paidSoFar(invoice: InvoiceRow, paidCent: number, creditedCent = 0) {
    db.select.mockImplementation(async (sql: string) => {
      if (sql.includes("SUM(amount_cent)")) return [{ paid_cent: paidCent }];
      if (sql.includes("AS credited_cent")) return [{ credited_cent: creditedCent }];
      return [invoice];
    });
  }
  const paidUpdate = () =>
    db.execute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE invoices SET status = 'paid'"))!;

  it("logs the open remainder as an auto payment and marks a sent invoice paid", async () => {
    paidSoFar(invoiceRow({ status: "partial", total: 10_000, amount_paid_cent: 4_000 }), 4_000);

    await markPaid(7, 1_750_000_000);

    expect(insertedPayments()).toHaveLength(1);
    expect(insertedPayments()[0][1]).toEqual([7, 1_750_000_000, 6_000]);
    expect(paidUpdate()[1]).toEqual([1_750_000_000, 10_000, 7]);
  });

  it("takes the open remainder from the recorded payments, not the cached amount", async () => {
    paidSoFar(invoiceRow({ status: "sent", total: 10_000, amount_paid_cent: 0 }), 4_000);

    await markPaid(7, 1_750_000_000);

    expect(insertedPayments()[0][1]).toEqual([7, 1_750_000_000, 6_000]);
  });

  it("keeps an overpayment visible instead of capping the paid amount at the total", async () => {
    paidSoFar(invoiceRow({ status: "partial", total: 10_000 }), 12_000);

    await markPaid(7, 1_750_000_000);

    expect(insertedPayments()).toHaveLength(0);
    expect(paidUpdate()[1]).toEqual([1_750_000_000, 12_000, 7]);
  });

  it("does not record a payment for a cancelled invoice", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "cancelled", total: 10_000 })]);

    await markPaid(7);

    expect(db.execute).not.toHaveBeenCalled();
  });

  it("refuses an invoice an issued credit note offsets, before booking anything", async () => {
    paidSoFar(invoiceRow({ status: "sent", total: 10_000 }), 0, 10_000);

    await expect(markPaid(7)).rejects.toThrow("Stornorechnung");

    expect(db.execute).not.toHaveBeenCalled();
  });

  it("books exactly what payments and a partial credit note leave open", async () => {
    paidSoFar(invoiceRow({ status: "partial", total: 11_900, amount_paid_cent: 5_000 }), 5_000, 3_000);

    await markPaid(7, 1_750_000_000);

    expect(insertedPayments()[0][1]).toEqual([7, 1_750_000_000, 3_900]);
    expect(paidUpdate()[1]).toEqual([1_750_000_000, 8_900, 7]);
  });
});

describe("deleteInvoice", () => {
  it("removes the payments of the deleted invoice, which have no FK cascade", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "cancelled", number: "DRAFT-abc" })]);

    await deleteInvoice(7);

    const statements = db.execute.mock.calls.map(([sql]) => String(sql));
    expect(statements).toEqual([
      "DELETE FROM invoice_payments WHERE invoice_id = ?",
      "DELETE FROM invoices WHERE id = ?",
    ]);
  });

  it.each([
    ["a sent invoice", invoiceRow({ status: "sent" })],
    ["a cancelled numbered invoice", invoiceRow({ status: "cancelled" })],
    ["a reopened draft that keeps its number", invoiceRow({ status: "draft" })],
  ])("refuses to delete %s", async (_label, row) => {
    db.select.mockResolvedValue([row]);

    await expect(deleteInvoice(7)).rejects.toThrow("ohne Rechnungsnummer");
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("cancelInvoice", () => {
  it("discards an unnumbered draft", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "draft", number: "DRAFT-abc" })]);

    await cancelInvoice(7);

    expect(db.execute.mock.calls[0][0]).toContain("SET status = 'cancelled'");
  });

  it.each([
    ["a sent invoice", invoiceRow({ status: "sent" })],
    ["a numbered draft", invoiceRow({ status: "draft" })],
  ])("refuses %s, which needs a credit note", async (_label, row) => {
    db.select.mockResolvedValue([row]);

    await expect(cancelInvoice(7)).rejects.toThrow("Stornorechnung");
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("reopenDraft", () => {
  function reopenSituation(invoice: InvoiceRow, payments: number, creditNote: InvoiceRow | null) {
    db.select.mockImplementation(async (sql: string) => {
      if (sql.includes("COUNT(*)")) return [{ c: payments }];
      if (sql.includes("corrects_invoice_id")) return creditNote ? [creditNote] : [];
      return [invoice];
    });
  }
  const creditNoteFor7 = (status: InvoiceRow["status"]) =>
    invoiceRow({ id: 8, is_credit_note: 1, corrects_invoice_id: 7, status });
  const issuedCreditNote = creditNoteFor7("sent");

  it("sends a sent invoice without payments back to draft, keeping its number", async () => {
    reopenSituation(invoiceRow({ status: "sent" }), 0, null);

    await reopenDraft(7);

    const [sql, binds] = db.execute.mock.calls[0];
    expect(sql).toContain("SET status = 'draft'");
    expect(sql).not.toContain("number");
    expect(binds).toEqual([7, "sent"]);
    expect(appendSeal).toHaveBeenCalledExactlyOnceWith(7, "reopen");
  });

  it.each([
    ["with payments", invoiceRow({ status: "sent" }), 1, null],
    ["with an issued credit note", invoiceRow({ status: "sent" }), 0, issuedCreditNote],
    ["with a draft credit note", invoiceRow({ status: "sent" }), 0, creditNoteFor7("draft")],
    ["that is paid", invoiceRow({ status: "paid" }), 0, null],
    ["that is cancelled and numbered", invoiceRow({ status: "cancelled" }), 0, null],
  ])("refuses an invoice %s", async (_label, invoice, payments, creditNote) => {
    reopenSituation(invoice, payments, creditNote);

    await expect(reopenDraft(7)).rejects.toThrow("wieder bearbeitet");
    expect(db.execute).not.toHaveBeenCalled();
  });
});
