import type { RecurringItemInput } from "$lib/db/recurring";
import { SECONDS_PER_DAY, toIsoDate, fromIsoDate } from "$lib/utils/date";
import { centsToPriceText } from "../entity/format";

export type RecurringItemRow = RecurringItemInput & {
  priceText: string;
  longDescription: string;
  periodStartIso: string;
  periodEndIso: string;
  showDetail: boolean;
};

type StoredItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  longDescription: string | null;
  linePeriodStart: number | null;
  linePeriodEnd: number | null;
};

export function emptyItemRow(vatRate: number): RecurringItemRow {
  return {
    description: "",
    quantity: 1,
    unit: "Stk",
    unitPrice: 0,
    vatRate,
    priceText: "",
    longDescription: "",
    periodStartIso: "",
    periodEndIso: "",
    showDetail: false,
  };
}

export function itemRowFromStored(item: StoredItem): RecurringItemRow {
  return {
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    vatRate: item.vatRate,
    priceText: centsToPriceText(item.unitPrice),
    longDescription: item.longDescription ?? "",
    periodStartIso: item.linePeriodStart ? toIsoDate(item.linePeriodStart) : "",
    periodEndIso: item.linePeriodEnd ? toIsoDate(item.linePeriodEnd) : "",
    showDetail: !!item.longDescription,
  };
}

export function itemInputFromRow(row: RecurringItemRow): RecurringItemInput {
  const longDescription = row.showDetail ? row.longDescription.trim() : "";
  return {
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: row.unitPrice,
    vatRate: row.vatRate,
    longDescription: longDescription || null,
    linePeriodStart: row.periodStartIso ? fromIsoDate(row.periodStartIso) : null,
    linePeriodEnd: row.periodEndIso ? fromIsoDate(row.periodEndIso) : null,
  };
}

/** Days between issue and due date, or `fallbackDays` when the invoice was due the day it was issued. */
export function paymentTermDays(issueDate: number, dueDate: number, fallbackDays: number): number {
  const days = Math.max(0, Math.round((dueDate - issueDate) / SECONDS_PER_DAY));
  return days || fallbackDays;
}
