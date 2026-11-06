import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { createExpense } from "./expenses";
import {
  createCreditNoteFromInvoice,
  createInvoice,
  getInvoice,
  issueInvoice,
  updateInvoice,
  type InvoiceFormInput,
} from "./invoices";
import { keepsStoredAmounts } from "./invoice-lifecycle";
import { createOffer, getOffer, updateOffer, type OfferFormInput } from "./offers";
import { createRecurring, updateRecurring } from "./recurring";
import { computeEurTotalCent } from "$lib/utils/currency";
import { computeTotals } from "$lib/utils/totals";
import { lineItemsFromStored, toLineItemInputs, toTotalsItem, type LineItemForm } from "../../routes/invoice/line-items";
import { offerKeepsStoredAmounts } from "../../routes/offer/offer-actions";

const day = (d: number) => new Date(2026, 4, d).getTime() / 1000;

const database = (): SqliteDatabase => sqlite.current!;

function rows<T>(query: string, ...bindings: (string | number)[]): T[] {
  return database().prepare(query).all(...bindings) as T[];
}

const POSITIONS = [
  { description: "Beratung", quantity: 0.47, unit: "Stk", unitPrice: 8_550, vatRate: 19 },
  { description: "Support", quantity: 4.1, unit: "h", unitPrice: 15, vatRate: 19 },
];

// The former float rounding stored these two lines as 4018 and 61 cent, the exact products are 4019 and 62.
const OLD_LINE_TOTALS = [4_018, 61];
const OLD_TOTALS = { subtotal: 4_079, vatAmount: 775, total: 4_854 };
const USD_RATE = "1.0850";

const invoiceInput = (overrides: Partial<InvoiceFormInput> = {}): InvoiceFormInput => ({
  customerId: 1,
  issueDate: day(5),
  deliveryDate: null,
  dueDate: day(19),
  notes: null,
  paymentTerms: null,
  reverseChargeType: "none",
  supplyKind: "services",
  items: POSITIONS,
  ...overrides,
});

/** A draft invoice exactly as the version before the exact rounding stored it. */
async function draftFromBeforeExactRounding(currency = "EUR"): Promise<number> {
  const id = await createInvoice(
    invoiceInput({ currency, exchangeRate: currency === "EUR" ? null : USD_RATE }),
  );
  OLD_LINE_TOTALS.forEach((lineTotal, index) =>
    database()
      .prepare("UPDATE invoice_items SET line_total = ? WHERE invoice_id = ? AND position = ?")
      .run(lineTotal, id, index + 1),
  );
  database()
    .prepare("UPDATE invoices SET subtotal = ?, vat_amount = ?, total = ?, eur_total_cent = ? WHERE id = ?")
    .run(
      OLD_TOTALS.subtotal,
      OLD_TOTALS.vatAmount,
      OLD_TOTALS.total,
      computeEurTotalCent(currency, OLD_TOTALS.total, USD_RATE),
      id,
    );
  return id;
}

/** An issued invoice exactly as the version before the exact rounding stored it. */
async function issuedInvoiceFromBeforeExactRounding(currency = "EUR"): Promise<number> {
  const id = await draftFromBeforeExactRounding(currency);
  await issueInvoice(id);
  return id;
}

/** Opens a stored draft in the invoice editor, optionally edits a row, and saves it the way the editor builds its input. */
async function saveLikeTheInvoiceEditor(id: number, edit: (rows: LineItemForm[]) => void = () => {}): Promise<void> {
  const { invoice, items } = (await getInvoice(id))!;
  const rowsInEditor = lineItemsFromStored(items, keepsStoredAmounts(invoice));
  edit(rowsInEditor);
  const totals = computeTotals(rowsInEditor.map(toTotalsItem), {
    isKleinunternehmer: invoice.isKleinunternehmer,
    isReverseCharge: false,
  });
  await updateInvoice(
    id,
    invoiceInput({
      items: toLineItemInputs(rowsInEditor),
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      exchangeRate: invoice.currency === "EUR" ? null : (invoice.exchangeRate ?? ""),
      eurTotalCent: computeEurTotalCent(invoice.currency, totals.total, invoice.exchangeRate ?? ""),
    }),
  );
}

const negated = (n: number) => -n;

beforeEach(() => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  database().exec(`
    INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH');
    INSERT INTO vendors (id, vendor_number, name) VALUES (1, 'L-0001', 'Lieferant');
    UPDATE settings SET is_kleinunternehmer = 0 WHERE id = 1;
  `);
});

describe("new invoices", () => {
  it("round the line total exactly", async () => {
    const { invoice, items } = (await getInvoice(await createInvoice(invoiceInput())))!;

    expect(items.map((i) => i.lineTotal)).toEqual([4_019, 62]);
    expect(invoice).toMatchObject({ subtotal: 4_081, vatAmount: 776, total: 4_857 });
  });
});

describe("a credit note of an invoice issued before the exact rounding", () => {
  it("is exactly the negative of the stored line totals, VAT and total", async () => {
    const originalId = await issuedInvoiceFromBeforeExactRounding();

    const creditNoteId = await createCreditNoteFromInvoice(originalId);

    const { invoice, items } = (await getInvoice(creditNoteId))!;
    expect(items.map((i) => i.lineTotal)).toEqual(OLD_LINE_TOTALS);
    expect(invoice).toMatchObject({
      subtotal: negated(OLD_TOTALS.subtotal),
      vatAmount: negated(OLD_TOTALS.vatAmount),
      total: negated(OLD_TOTALS.total),
    });
  });

  it("copies the frozen EUR total of a foreign-currency original instead of deriving it again", async () => {
    const originalId = await issuedInvoiceFromBeforeExactRounding("USD");
    const FROZEN_EUR_TOTAL = 4_470;
    database().prepare("UPDATE invoices SET eur_total_cent = ? WHERE id = ?").run(FROZEN_EUR_TOTAL, originalId);
    expect(computeEurTotalCent("USD", OLD_TOTALS.total, USD_RATE)).not.toBe(FROZEN_EUR_TOTAL);

    const { invoice } = (await getInvoice(await createCreditNoteFromInvoice(originalId)))!;

    expect(invoice.eurTotalCent).toBe(negated(FROZEN_EUR_TOTAL));
  });

  it("keeps the mirrored EUR total when the USD draft is saved from the editor without changes", async () => {
    const originalId = await issuedInvoiceFromBeforeExactRounding("USD");
    const original = (await getInvoice(originalId))!.invoice;
    const creditNoteId = await createCreditNoteFromInvoice(originalId);

    await saveLikeTheInvoiceEditor(creditNoteId);

    const saved = (await getInvoice(creditNoteId))!;
    expect(saved.invoice.eurTotalCent).toBe(negated(original.eurTotalCent!));
    expect(saved.invoice.total).toBe(negated(OLD_TOTALS.total));
  });

  it("keeps the amounts when the draft is saved from the editor without changes", async () => {
    const creditNoteId = await createCreditNoteFromInvoice(await issuedInvoiceFromBeforeExactRounding());

    await saveLikeTheInvoiceEditor(creditNoteId);

    const saved = (await getInvoice(creditNoteId))!;
    expect(saved.items.map((i) => i.lineTotal)).toEqual(OLD_LINE_TOTALS);
    expect(saved.invoice).toMatchObject({
      subtotal: negated(OLD_TOTALS.subtotal),
      vatAmount: negated(OLD_TOTALS.vatAmount),
      total: negated(OLD_TOTALS.total),
    });
  });

  it("computes a position again once the editor changed its quantity (partial refund)", async () => {
    const creditNoteId = await createCreditNoteFromInvoice(await issuedInvoiceFromBeforeExactRounding());

    await saveLikeTheInvoiceEditor(creditNoteId, (rows) => (rows[0].quantity = 0.5));

    const saved = (await getInvoice(creditNoteId))!;
    expect(saved.items.map((i) => i.lineTotal)).toEqual([4_275, 61]);
    expect(saved.invoice.subtotal).toBe(negated(4_336));
  });
});

describe("a reopened draft of an old invoice", () => {
  it("keeps its stored line totals when saved without changes", async () => {
    const id = await issuedInvoiceFromBeforeExactRounding();
    database().prepare("UPDATE invoices SET status = 'draft', sent_at = NULL WHERE id = ?").run(id);

    await saveLikeTheInvoiceEditor(id);

    const saved = (await getInvoice(id))!;
    expect(saved.items.map((i) => i.lineTotal)).toEqual(OLD_LINE_TOTALS);
    expect(saved.invoice).toMatchObject(OLD_TOTALS);
  });
});

describe("a draft invoice from before the exact rounding that was never issued", () => {
  it("follows the exact rounding once it is saved from the editor", async () => {
    const id = await draftFromBeforeExactRounding();

    await saveLikeTheInvoiceEditor(id);

    const saved = (await getInvoice(id))!;
    expect(saved.items.map((i) => i.lineTotal)).toEqual([4_019, 62]);
    expect(saved.invoice).toMatchObject({ subtotal: 4_081, vatAmount: 776, total: 4_857 });
  });
});

describe("a draft offer from before the exact rounding", () => {
  const offerInput = (items: OfferFormInput["items"]): OfferFormInput => ({
    customerId: 1,
    issueDate: day(5),
    validUntil: day(30),
    notes: null,
    introText: null,
    reverseChargeType: "none",
    supplyKind: "services",
    items,
  });

  async function offerFromBeforeExactRounding(pdfPath: string | null): Promise<number> {
    const id = await createOffer(offerInput(POSITIONS));
    OLD_LINE_TOTALS.forEach((lineTotal, index) =>
      database()
        .prepare("UPDATE offer_items SET line_total = ? WHERE offer_id = ? AND position = ?")
        .run(lineTotal, id, index + 1),
    );
    database()
      .prepare("UPDATE offers SET subtotal = ?, vat_amount = ?, total = ?, pdf_path = ? WHERE id = ?")
      .run(OLD_TOTALS.subtotal, OLD_TOTALS.vatAmount, OLD_TOTALS.total, pdfPath, id);
    return id;
  }

  async function saveLikeTheOfferEditor(id: number): Promise<void> {
    const { offer, items } = (await getOffer(id))!;
    const rowsInEditor = lineItemsFromStored(items, offerKeepsStoredAmounts(offer));
    await updateOffer(id, offerInput(toLineItemInputs(rowsInEditor)));
  }

  it("that never had a PDF follows the exact rounding once it is saved from the editor", async () => {
    const id = await offerFromBeforeExactRounding(null);

    await saveLikeTheOfferEditor(id);

    const saved = (await getOffer(id))!;
    expect(saved.items.map((i) => i.lineTotal)).toEqual([4_019, 62]);
    expect(saved.offer).toMatchObject({ subtotal: 4_081, vatAmount: 776, total: 4_857 });
  });

  it("that was reopened after being sent keeps the amounts the customer saw", async () => {
    const id = await offerFromBeforeExactRounding("C:/Zettel/Angebote/AN-2026-0001.pdf");

    await saveLikeTheOfferEditor(id);

    const saved = (await getOffer(id))!;
    expect(saved.items.map((i) => i.lineTotal)).toEqual(OLD_LINE_TOTALS);
    expect(saved.offer).toMatchObject(OLD_TOTALS);
  });
});

describe("a cleared quantity field", () => {
  const cleared = { ...POSITIONS[0], quantity: null as unknown as number };

  it("is refused on a new invoice instead of being stored as 0", async () => {
    await expect(createInvoice(invoiceInput({ items: [cleared] }))).rejects.toThrow("Menge fehlt oder ist ungültig.");

    expect(rows("SELECT * FROM invoice_items")).toEqual([]);
  });

  it("is refused when an invoice is updated, and the stored positions stay", async () => {
    const id = await createInvoice(invoiceInput());

    await expect(updateInvoice(id, invoiceInput({ items: [cleared] }))).rejects.toThrow("Menge fehlt oder ist ungültig.");

    expect((await getInvoice(id))!.items.map((i) => i.description)).toEqual(["Beratung", "Support"]);
  });

  it("is refused on an offer", async () => {
    await expect(
      createOffer({
        customerId: 1,
        issueDate: day(5),
        validUntil: day(30),
        notes: null,
        introText: null,
        reverseChargeType: "none",
        supplyKind: "services",
        items: [cleared],
      }),
    ).rejects.toThrow("Menge fehlt oder ist ungültig.");
  });

  it("is refused on a recurring template, and the stored positions stay", async () => {
    const template = {
      name: "Wartung",
      customerId: 1,
      interval: "monthly" as const,
      startDate: day(1),
      paymentTermsDays: 14,
      reverseChargeType: "none" as const,
      supplyKind: "services" as const,
      notes: null,
      paymentTerms: null,
      active: true,
    };
    const id = await createRecurring({ ...template, items: [POSITIONS[0]] });

    await expect(updateRecurring(id, { ...template, items: [cleared] })).rejects.toThrow("Menge fehlt oder ist ungültig.");

    expect(rows<{ description: string }>("SELECT description FROM recurring_invoice_items")).toEqual([
      { description: "Beratung" },
    ]);
  });
});

describe("saved quantities", () => {
  const RAW_QUANTITY = 0.12346;
  const STORED_QUANTITY = 0.1235;
  const position = { description: "Beratung", quantity: RAW_QUANTITY, unit: "Stk", unitPrice: 100_000, vatRate: 19 };

  const storedQuantities = (table: string) => rows<{ quantity: number }>(`SELECT quantity FROM ${table}`).map((r) => r.quantity);

  it("have four decimals on an invoice, and the line total is computed from the stored one", async () => {
    const { invoice, items } = (await getInvoice(await createInvoice(invoiceInput({ items: [position] }))))!;

    expect(items[0].quantity).toBe(STORED_QUANTITY);
    expect(items[0].lineTotal).toBe(12_350);
    expect(invoice.subtotal).toBe(12_350);
  });

  it("have four decimals on an invoice after an update", async () => {
    const id = await createInvoice(invoiceInput());

    await updateInvoice(id, invoiceInput({ items: [position] }));

    expect(storedQuantities("invoice_items")).toEqual([STORED_QUANTITY]);
  });

  it("have four decimals on an offer", async () => {
    await createOffer({
      customerId: 1,
      issueDate: day(5),
      validUntil: day(30),
      notes: null,
      introText: null,
      reverseChargeType: "none",
      supplyKind: "services",
      items: [position],
    });

    expect(storedQuantities("offer_items")).toEqual([STORED_QUANTITY]);
  });

  it("have four decimals on a recurring template", async () => {
    await createRecurring({
      name: "Wartung",
      customerId: 1,
      interval: "monthly",
      startDate: day(1),
      paymentTermsDays: 14,
      reverseChargeType: "none",
      supplyKind: "services",
      notes: null,
      paymentTerms: null,
      active: true,
      items: [position],
    });

    expect(storedQuantities("recurring_invoice_items")).toEqual([STORED_QUANTITY]);
  });

  it("have four decimals on an expense", async () => {
    await createExpense({
      number: "R-1",
      vendorId: 1,
      issueDate: day(5),
      dueDate: null,
      notes: null,
      reverseChargeType: "none",
      pdfPath: null,
      items: [{ ...position, category: null, datevAccount: null }],
    });

    expect(storedQuantities("expense_items")).toEqual([STORED_QUANTITY]);
  });
});
