import type { ExpenseItemInput } from "$lib/db/expenses";
import type { Expense, Vendor } from "$lib/db/schema";
import type { ExtractedInvoice, ExtractedText } from "$lib/sidecar/extract";
import { nowUnix, toIsoDate } from "$lib/utils/date";
import { centsToPriceText } from "../entity/format";
import { STANDARD_VAT_RATE } from "../entity/vat";

export type ReverseChargeType = Expense["reverseChargeType"];

export type ExpenseItemRow = ExpenseItemInput & { priceText: string };

export type ExpenseFormState = {
  vendorId: string;
  vendorNumber: string;
  issueDateIso: string;
  dueDateIso: string;
  notes: string;
  reverseChargeType: ReverseChargeType;
  items: ExpenseItemRow[];
};

type StoredExpenseItem = {
  description: string;
  category: string | null;
  categoryId: number | null;
  datevAccount: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
};

const DEFAULT_UNIT = "Stk";
const LUMP_SUM_UNIT = "Pauschal";

export function emptyItemRow(overrides: Partial<ExpenseItemRow> = {}): ExpenseItemRow {
  return {
    description: "",
    category: null,
    categoryId: null,
    datevAccount: null,
    quantity: 1,
    unit: DEFAULT_UNIT,
    unitPrice: 0,
    vatRate: STANDARD_VAT_RATE,
    priceText: "",
    ...overrides,
  };
}

export function itemRowFromStored(item: StoredExpenseItem): ExpenseItemRow {
  return {
    description: item.description,
    category: item.category,
    categoryId: item.categoryId,
    datevAccount: item.datevAccount,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    vatRate: item.vatRate,
    priceText: centsToPriceText(item.unitPrice),
  };
}

export function emptyExpenseForm(): ExpenseFormState {
  return {
    vendorId: "",
    vendorNumber: "",
    issueDateIso: toIsoDate(nowUnix()),
    dueDateIso: "",
    notes: "",
    reverseChargeType: "none",
    items: [emptyItemRow()],
  };
}

export function isReverseCharge(form: Pick<ExpenseFormState, "reverseChargeType">): boolean {
  return form.reverseChargeType !== "none";
}

export function itemInputFromRow(row: ExpenseItemRow): ExpenseItemInput {
  return {
    description: row.description,
    category: row.category?.trim() || null,
    categoryId: row.categoryId ?? null,
    datevAccount: row.datevAccount?.trim() || null,
    quantity: row.quantity,
    unit: row.unit,
    unitPrice: row.unitPrice,
    vatRate: row.vatRate,
  };
}

/** Fills the form from the supplier's ZUGFeRD data; fields the invoice does not carry stay untouched. */
export function applyInvoiceExtract(
  form: ExpenseFormState,
  data: ExtractedInvoice,
  vendor: Vendor | null,
): void {
  applyHeaderFields(form, data, vendor);
  form.reverseChargeType = data.reverseChargeType;
  if (data.lineItems.length === 0) return;
  form.items = data.lineItems.map((line) =>
    emptyItemRow({
      description: line.description,
      category: vendor?.defaultCategory ?? null,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      priceText: centsToPriceText(line.unitPrice),
    }),
  );
}

/** Text-layer heuristics only know the gross total, so it becomes one lump-sum position. */
export function applyTextExtract(
  form: ExpenseFormState,
  data: ExtractedText,
  vendor: Vendor | null,
): void {
  applyHeaderFields(form, data, vendor);
  const [onlyItem] = form.items;
  const hasBlankSingleItem = form.items.length === 1 && onlyItem.unitPrice === 0;
  if (!data.totalCents || data.totalCents <= 0 || !hasBlankSingleItem) return;

  const reverseCharge = isReverseCharge(form);
  const vatRate = reverseCharge ? 0 : STANDARD_VAT_RATE;
  const netCents = reverseCharge
    ? data.totalCents
    : Math.round(data.totalCents / (1 + vatRate / 100));
  onlyItem.description = data.invoiceNumber
    ? `Eingangsrechnung ${data.invoiceNumber}`
    : "Eingangsrechnung (heuristisch)";
  onlyItem.quantity = 1;
  onlyItem.unit = LUMP_SUM_UNIT;
  onlyItem.vatRate = vatRate;
  onlyItem.unitPrice = netCents;
  onlyItem.priceText = centsToPriceText(netCents);
}

function applyHeaderFields(
  form: ExpenseFormState,
  data: { invoiceNumber: string | null; issueDate: number | null; dueDate: number | null },
  vendor: Vendor | null,
): void {
  if (vendor) form.vendorId = String(vendor.id);
  if (data.invoiceNumber) form.vendorNumber = data.invoiceNumber;
  if (data.issueDate) form.issueDateIso = toIsoDate(data.issueDate);
  if (data.dueDate) form.dueDateIso = toIsoDate(data.dueDate);
}
