import { describe, expect, it } from "vitest";
import type { Vendor } from "$lib/db/schema";
import type { ExtractedInvoice, ExtractedText } from "$lib/sidecar/extract";
import { fromIsoDate } from "$lib/utils/date";
import { computeLineTotal } from "$lib/utils/totals";
import type { ExpenseCategory } from "$lib/db/schema";
import {
  applyCategory,
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
        unitPriceDecimal: "12.5",
        vatRate: 19,
        lineTotal: 2500,
        categoryCode: null,
      },
    ],
    taxGroups: [{ vatRate: 19, basis: 2500, tax: 475, categoryCode: "S" }],
    totals: { subtotal: 2500, net: 2500, vatAmount: 475, total: 2975 },
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

  it("books the supplier's line total when the unit price has sub-cent precision", () => {
    // 1000 kWh x 0,3249 EUR = 324,90 EUR; the cent-rounded price would give 320,00.
    const form = emptyExpenseForm();
    applyInvoiceExtract(
      form,
      invoice({
        lineItems: [
          {
            description: "Strom",
            quantity: 1000,
            unit: "kWh",
            unitPrice: 32,
            unitPriceDecimal: "0.3249",
            vatRate: 19,
            lineTotal: 32490,
            categoryCode: "S",
          },
        ],
        taxGroups: [{ vatRate: 19, basis: 32490, tax: 6173, categoryCode: "S" }],
      }),
      null,
    );

    expect(form.items).toHaveLength(1);
    expect(computeLineTotal(form.items[0])).toBe(32490);
    expect(form.items[0]).toMatchObject({
      description: "Strom (1000 kWh × 0,3249 €)",
      quantity: 1,
      unit: "Pauschal",
      unitPrice: 32490,
      priceText: "324,90",
    });
  });

  it("keeps quantity and unit price when they reproduce the line total", () => {
    const form = emptyExpenseForm();
    applyInvoiceExtract(form, invoice(), null);

    expect(form.items[0]).toMatchObject({ quantity: 2, unit: "Monat", unitPrice: 1250 });
  });

  it("falls back to the VAT breakdown when a document allowance makes the lines disagree with it", () => {
    // Lines add up to 100,00 net, but a 10,00 document allowance leaves 90,00 owed.
    const form = emptyExpenseForm();
    applyInvoiceExtract(
      form,
      invoice({
        lineItems: [
          {
            description: "Beratung",
            quantity: 1,
            unit: "Pauschal",
            unitPrice: 10000,
            unitPriceDecimal: "100",
            vatRate: 19,
            lineTotal: 10000,
            categoryCode: "S",
          },
        ],
        taxGroups: [{ vatRate: 19, basis: 9000, tax: 1710, categoryCode: "S" }],
      }),
      vendor,
    );

    expect(form.items).toHaveLength(1);
    expect(form.items[0]).toMatchObject({
      description: "Rechnungsposten 19 % USt",
      category: "Hosting",
      unitPrice: 9000,
      vatRate: 19,
      priceText: "90,00",
    });
  });

  it("books one position per VAT rate when the breakdown has several", () => {
    const form = emptyExpenseForm();
    applyInvoiceExtract(
      form,
      invoice({
        taxGroups: [
          { vatRate: 7, basis: 1000, tax: 70, categoryCode: "S" },
          { vatRate: 19, basis: 2500, tax: 475, categoryCode: "S" },
        ],
      }),
      null,
    );

    expect(form.items.map((item) => [item.vatRate, item.unitPrice])).toEqual([
      [7, 1000],
      [19, 2500],
    ]);
  });

  it("keeps the lines when the invoice has no VAT breakdown to check against", () => {
    const form = emptyExpenseForm();
    applyInvoiceExtract(form, invoice({ taxGroups: [] }), null);

    expect(form.items).toHaveLength(1);
    expect(form.items[0].description).toBe("Server");
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

describe("applyCategory", () => {
  const hosting = {
    id: 1,
    name: "Hosting",
    datevAccountSkr03: "4930",
    datevAccountSkr04: "6805",
  } as ExpenseCategory;

  it("stores category id and name but no account, since the SKR is only chosen at export", () => {
    const row = emptyItemRow();
    applyCategory(row, hosting);
    expect([row.categoryId, row.category, row.datevAccount]).toEqual([1, "Hosting", null]);
  });

  it("keeps an account the user typed", () => {
    const row = emptyItemRow({ datevAccount: "4999" });
    applyCategory(row, hosting);
    expect(row.datevAccount).toBe("4999");
  });

  it("switches to free text without touching name or account", () => {
    const row = emptyItemRow({ categoryId: 1, category: "Hosting", datevAccount: "4999" });
    applyCategory(row, undefined);
    expect([row.categoryId, row.category, row.datevAccount]).toEqual([null, "Hosting", "4999"]);
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
