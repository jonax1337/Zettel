import { describe, expect, it } from "vitest";
import type { CatalogItem } from "$lib/db/schema";
import {
  lineItemFromCatalog,
  lineItemFromStored,
  moveLineItem,
  newLineItem,
  toLineItemInputs,
  toTotalsItem,
  zeroVatRates,
} from "./line-items";

const catalogItem = {
  name: "Beratung",
  unit: "h",
  defaultUnitPrice: 12050,
  defaultVatRate: 7,
  descriptionDe: "Beschreibung DE",
  descriptionEn: "Description EN",
} as CatalogItem;

describe("newLineItem", () => {
  it("hands out unique row keys", () => {
    expect(newLineItem().uid).not.toBe(newLineItem().uid);
  });

  it("starts with one piece and the given VAT rate", () => {
    expect(newLineItem(19)).toMatchObject({ quantity: 1, unit: "Stk", vatRate: 19, unitPrice: 0 });
  });
});

describe("lineItemFromStored", () => {
  it("formats the price and opens the detail row only for a long description", () => {
    const base = {
      description: "Entwicklung",
      quantity: 2,
      unit: "h",
      unitPrice: 8000,
      vatRate: 19,
      linePeriodStart: null,
      linePeriodEnd: null,
    };
    const plain = lineItemFromStored({ ...base, longDescription: null });
    const detailed = lineItemFromStored({ ...base, longDescription: "Details" });
    expect(plain.priceText).toBe("80,00");
    expect(plain.showDetail).toBe(false);
    expect(detailed.showDetail).toBe(true);
    expect(detailed.longDescription).toBe("Details");
  });
});

describe("lineItemFromCatalog", () => {
  it("takes the catalog VAT rate unless the document is VAT exempt", () => {
    expect(lineItemFromCatalog(catalogItem, { vatExempt: false, language: "de" }).vatRate).toBe(7);
    expect(lineItemFromCatalog(catalogItem, { vatExempt: true, language: "de" }).vatRate).toBe(0);
  });

  it("picks the description by PDF language and falls back to German", () => {
    expect(lineItemFromCatalog(catalogItem, { vatExempt: false, language: "en" }).longDescription).toBe(
      "Description EN",
    );
    const withoutEnglish = { ...catalogItem, descriptionEn: null } as CatalogItem;
    expect(lineItemFromCatalog(withoutEnglish, { vatExempt: false, language: "en" }).longDescription).toBe(
      "Beschreibung DE",
    );
  });

  it("keeps the detail row closed when the catalog has no description", () => {
    const bare = { ...catalogItem, descriptionDe: "", descriptionEn: null } as CatalogItem;
    expect(lineItemFromCatalog(bare, { vatExempt: false, language: "de" }).showDetail).toBe(false);
  });
});

describe("toLineItemInputs", () => {
  it("drops the long description when the detail row is closed", () => {
    const item = newLineItem();
    item.longDescription = "  versteckt ";
    expect(toLineItemInputs([item])[0].longDescription).toBeNull();
    item.showDetail = true;
    expect(toLineItemInputs([item])[0].longDescription).toBe("versteckt");
  });

  it("converts ISO periods to unix timestamps and empty ones to null", () => {
    const item = newLineItem();
    item.periodStartIso = "2026-03-01";
    const [input] = toLineItemInputs([item]);
    expect(input.linePeriodStart).toBeTypeOf("number");
    expect(input.linePeriodEnd).toBeNull();
  });
});

describe("stored line totals", () => {
  // Stored under the former float rounding: 0,47 x 85,50 EUR was 40,18 EUR, the exact product is 40,19 EUR.
  const stored = {
    description: "Beratung",
    quantity: 0.47,
    unit: "Stk",
    unitPrice: 8550,
    vatRate: 19,
    longDescription: null,
    linePeriodStart: null,
    linePeriodEnd: null,
    lineTotal: 4018,
  };

  it("are handed on while quantity and price are the stored ones", () => {
    const item = lineItemFromStored(stored);
    expect(toLineItemInputs([item])[0].fixedLineTotal).toBe(4018);
    expect(toTotalsItem(item).fixedLineTotal).toBe(4018);
  });

  it("are dropped once the quantity or the price was edited", () => {
    const item = lineItemFromStored(stored);
    item.quantity = 0.5;
    expect(toLineItemInputs([item])[0].fixedLineTotal).toBeUndefined();
    item.quantity = 0.47;
    item.unitPrice = 8600;
    expect(toTotalsItem(item).fixedLineTotal).toBeUndefined();
  });

  it("do not exist for a new position or a stored one without an amount", () => {
    const { lineTotal: _, ...template } = stored;
    expect(toLineItemInputs([newLineItem()])[0].fixedLineTotal).toBeUndefined();
    expect(toLineItemInputs([lineItemFromStored(template)])[0].fixedLineTotal).toBeUndefined();
  });
});

describe("moveLineItem", () => {
  it("moves an element to the target index", () => {
    expect(moveLineItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveLineItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("returns the same array for no-op or out-of-range moves", () => {
    const items = ["a", "b"];
    expect(moveLineItem(items, 1, 1)).toBe(items);
    expect(moveLineItem(items, 0, -1)).toBe(items);
    expect(moveLineItem(items, 0, 2)).toBe(items);
    expect(moveLineItem(items, 5, 0)).toBe(items);
  });
});

describe("zeroVatRates", () => {
  it("zeroes all rates and reports whether it changed anything", () => {
    const items = [newLineItem(19), newLineItem(0), newLineItem(7)];
    expect(zeroVatRates(items)).toBe(true);
    expect(items.map((i) => i.vatRate)).toEqual([0, 0, 0]);
    expect(zeroVatRates(items)).toBe(false);
  });
});
