import type { CatalogItem } from "$lib/db/schema";
import { fromIsoDate, toIsoDate } from "$lib/utils/date";
import { DEFAULT_UNIT } from "$lib/utils/units";
import { centsToPriceText } from "../parts/entity/format";

export type LineItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  longDescription: string | null;
  linePeriodStart: number | null;
  linePeriodEnd: number | null;
};

/** Editable position row: the input fields plus the text state behind the form controls. */
export type LineItemForm = {
  /** Stable per-row key so keyed {#each} + animate:flip survive reordering. */
  uid: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  priceText: string;
  longDescription: string;
  periodStartIso: string;
  periodEndIso: string;
  showDetail: boolean;
};

/** Position as stored in the DB, shared by invoice and offer items. */
export type StoredLineItem = LineItemInput;

let lastUid = 0;

export function newLineItem(vatRate = 0): LineItemForm {
  return {
    uid: ++lastUid,
    description: "",
    quantity: 1,
    unit: DEFAULT_UNIT,
    unitPrice: 0,
    vatRate,
    priceText: "",
    longDescription: "",
    periodStartIso: "",
    periodEndIso: "",
    showDetail: false,
  };
}

export function lineItemFromStored(row: StoredLineItem): LineItemForm {
  return {
    uid: ++lastUid,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: row.unitPrice,
    vatRate: row.vatRate,
    priceText: centsToPriceText(row.unitPrice),
    longDescription: row.longDescription ?? "",
    periodStartIso: row.linePeriodStart ? toIsoDate(row.linePeriodStart) : "",
    periodEndIso: row.linePeriodEnd ? toIsoDate(row.linePeriodEnd) : "",
    showDetail: !!row.longDescription,
  };
}

export function lineItemFromCatalog(
  catalogItem: CatalogItem,
  opts: { vatExempt: boolean; language: "de" | "en" },
): LineItemForm {
  const item = newLineItem(opts.vatExempt ? 0 : catalogItem.defaultVatRate);
  item.description = catalogItem.name;
  item.unit = catalogItem.unit;
  item.unitPrice = catalogItem.defaultUnitPrice;
  item.priceText = centsToPriceText(catalogItem.defaultUnitPrice);
  const description =
    opts.language === "en" && catalogItem.descriptionEn
      ? catalogItem.descriptionEn
      : catalogItem.descriptionDe;
  if (description) {
    item.longDescription = description;
    item.showDetail = true;
  }
  return item;
}

export function toLineItemInputs(items: LineItemForm[]): LineItemInput[] {
  return items.map((item) => {
    const longDescription = item.longDescription.trim();
    return {
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      vatRate: item.vatRate,
      longDescription: item.showDetail && longDescription ? longDescription : null,
      linePeriodStart: item.periodStartIso ? fromIsoDate(item.periodStartIso) : null,
      linePeriodEnd: item.periodEndIso ? fromIsoDate(item.periodEndIso) : null,
    };
  });
}

/** Returns a reordered copy, or the same array when the move is a no-op. */
export function moveLineItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return reordered;
}

/** Sets every non-zero VAT rate to 0 in place; returns whether anything changed. */
export function zeroVatRates(items: LineItemForm[]): boolean {
  let changed = false;
  for (const item of items) {
    if (item.vatRate !== 0) {
      item.vatRate = 0;
      changed = true;
    }
  }
  return changed;
}
