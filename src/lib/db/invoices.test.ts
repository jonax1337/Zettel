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
  })),
}));

import {
  buildInvoiceFilter,
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
  updateInvoice,
  type InvoiceFormInput,
} from "./invoices";
import type { InvoiceRow } from "./invoice-rows";
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

  it("carries the foreign-currency terms of the original into the credit note input", () => {
    const input = creditNoteInputFor(usdInvoice, items, 1_800_000_000);

    expect(input).toMatchObject({
      currency: "USD",
      exchangeRate: "1,08",
      eurTotalCent: 9_259,
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
});

describe("issueInvoice", () => {
  it("draws the real number from the invoice counter for a DRAFT- placeholder", async () => {
    db.select
      .mockResolvedValueOnce([invoiceRow({ status: "draft", number: "DRAFT-abc" })])
      .mockResolvedValueOnce([{ counter: 12, format: "RE-{NNNN}" }]);

    const number = await issueInvoice(7, 1_750_000_000);

    expect(number).toBe("RE-0012");
    const update = db.execute.mock.calls.find(([sql]) => String(sql).includes("SET number = ?"))!;
    expect(update[1]).toEqual(["RE-0012", 1_750_000_000, 7]);
  });

  it("keeps an already assigned number without touching the counter", async () => {
    db.select.mockResolvedValueOnce([invoiceRow({ status: "draft", number: "RE-2026-0009" })]);

    expect(await issueInvoice(7)).toBe("RE-2026-0009");
    expect(db.execute.mock.calls.some(([sql]) => String(sql).includes("invoice_number_counter"))).toBe(false);
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

  it("logs the open remainder as an auto payment and marks a sent invoice paid", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "partial", total: 10_000, amount_paid_cent: 4_000 })]);

    await markPaid(7, 1_750_000_000);

    expect(insertedPayments()).toHaveLength(1);
    expect(insertedPayments()[0][1]).toEqual([7, 1_750_000_000, 6_000]);
    const update = db.execute.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE invoices SET status = 'paid'"))!;
    expect(update[1]).toEqual([1_750_000_000, 10_000, 7]);
  });

  it("does not record a payment for a cancelled invoice", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "cancelled", total: 10_000 })]);

    await markPaid(7);

    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("deleteInvoice", () => {
  it("removes the payments of the deleted invoice, which have no FK cascade", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "cancelled" })]);

    await deleteInvoice(7);

    const statements = db.execute.mock.calls.map(([sql]) => String(sql));
    expect(statements).toEqual([
      "DELETE FROM invoice_payments WHERE invoice_id = ?",
      "DELETE FROM invoices WHERE id = ?",
    ]);
  });

  it("refuses to delete a sent invoice", async () => {
    db.select.mockResolvedValue([invoiceRow({ status: "sent" })]);

    await expect(deleteInvoice(7)).rejects.toThrow("Nur Entwürfe");
    expect(db.execute).not.toHaveBeenCalled();
  });
});
