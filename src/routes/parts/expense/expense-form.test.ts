import { describe, expect, it } from "vitest";
import type { Vendor } from "$lib/db/schema";
import type { ExtractedInvoice, ExtractedText } from "$lib/sidecar/extract";
import { fromIsoDate } from "$lib/utils/date";
import {
  applyInvoiceExtract,
  applyTextExtract,
  emptyExpenseForm,
  emptyItemRow,
  isReverseCharge,
  itemInputFromRow,
  itemRowFromStored,
} from "./expense-form";

const vendor = { id: 7, defaultCategory: "Hosting" } as Vendor;

function invoice(overrides: Partial<ExtractedInvoice> = {}): ExtractedInvoice {
  return {
    invoiceNumber: "R-1",
    typeCode: "380",
    isCreditNote: false,
    issueDate: fromIsoDate("2026-02-03"),
    dueDate: fromIsoDate("2026-02-17"),
    deliveryDate: null,
    currency: "EUR",
    reverseChargeType: "none",
    seller: {} as ExtractedInvoice["seller"],
    buyer: {} as ExtractedInvoice["buyer"],
    lineItems: [
      {
        description: "Server",
        quantity: 2,
        unit: "Monat",
        unitPrice: 1250,
        vatRate: 19,
        lineTotal: 2500,
        categoryCode: null,
      },
    ],
    totals: { subtotal: 2500, vatAmount: 475, total: 2975 },
    ...overrides,
  };
}

function text(overrides: Partial<ExtractedText> = {}): ExtractedText {
  return {
    invoiceNumber: "T-9",
    issueDate: null,
    dueDate: null,
    totalCents: 11900,
    currency: "EUR",
    vendorName: null,
    vendorVatId: null,
    ...overrides,
  };
}

describe("applyInvoiceExtract", () => {
  it("copies header fields, vendor and line items into the form", () => {
    const form = emptyExpenseForm();
    applyInvoiceExtract(form, invoice(), vendor);

    expect(form.vendorId).toBe("7");
    expect(form.vendorNumber).toBe("R-1");
    expect(form.issueDateIso).toBe("2026-02-03");
    expect(form.dueDateIso).toBe("2026-02-17");
    expect(form.items).toHaveLength(1);
    expect(form.items[0]).toMatchObject({
      description: "Server",
      category: "Hosting",
      quantity: 2,
      unit: "Monat",
      unitPrice: 1250,
      priceText: "12,50",
    });
  });

  it("keeps the kind of reverse charge the supplier declared", () => {
    for (const kind of ["intra_eu", "third_country"] as const) {
      const form = emptyExpenseForm();
      applyInvoiceExtract(form, invoice({ reverseChargeType: kind }), null);
      expect(form.reverseChargeType).toBe(kind);
      expect(isReverseCharge(form)).toBe(true);
    }
  });

  it("keeps the manual line item when the invoice carries none", () => {
    const form = emptyExpenseForm();
    applyInvoiceExtract(form, invoice({ lineItems: [] }), null);
    expect(form.items).toHaveLength(1);
    expect(form.items[0].description).toBe("");
  });

  it("leaves the vendor alone when none matched", () => {
    const form = emptyExpenseForm();
    form.vendorId = "3";
    applyInvoiceExtract(form, invoice(), null);
    expect(form.vendorId).toBe("3");
  });
});

describe("applyTextExtract", () => {
  it("turns the gross total into one net lump-sum position", () => {
    const form = emptyExpenseForm();
    applyTextExtract(form, text(), vendor);

    expect(form.vendorId).toBe("7");
    expect(form.items[0]).toMatchObject({
      description: "Eingangsrechnung T-9",
      unit: "Pauschal",
      quantity: 1,
      vatRate: 19,
      unitPrice: 10000,
      priceText: "100,00",
    });
  });

  it("takes the total as net under reverse charge", () => {
    const form = emptyExpenseForm();
    form.reverseChargeType = "intra_eu";
    applyTextExtract(form, text(), null);
    expect(form.items[0]).toMatchObject({ vatRate: 0, unitPrice: 11900 });
  });

  it("does not overwrite items the user already filled in", () => {
    const form = emptyExpenseForm();
    form.items[0].unitPrice = 500;
    applyTextExtract(form, text(), null);
    expect(form.items[0].unitPrice).toBe(500);
  });

  it("ignores a missing or non-positive total", () => {
    const form = emptyExpenseForm();
    applyTextExtract(form, text({ totalCents: null }), null);
    applyTextExtract(form, text({ totalCents: 0 }), null);
    expect(form.items[0].unitPrice).toBe(0);
  });
});

describe("item rows", () => {
  it("derives the price text from stored cents and trims text fields for saving", () => {
    const row = itemRowFromStored({
      description: "Lizenz",
      category: " Software ",
      categoryId: null,
      datevAccount: "  ",
      quantity: 1,
      unit: "Stk",
      unitPrice: 990,
      vatRate: 19,
    });
    expect(row.priceText).toBe("9,90");
    expect(itemInputFromRow(row)).toEqual({
      description: "Lizenz",
      category: "Software",
      categoryId: null,
      datevAccount: null,
      quantity: 1,
      unit: "Stk",
      unitPrice: 990,
      vatRate: 19,
    });
  });

  it("starts with the standard VAT rate", () => {
    expect(emptyItemRow().vatRate).toBe(19);
    expect(emptyItemRow({ vatRate: 0 }).vatRate).toBe(0);
  });
});
