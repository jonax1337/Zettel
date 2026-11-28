import type { ReverseChargeType } from "$lib/db/invoices";
import {
  exchangeRateError,
  linePeriodError,
  quantityError,
  reverseChargeError,
  servicePeriodError,
  type ReverseChargeSender,
} from "../../invoice/form-validation";
import type { LineItemForm } from "../../invoice/line-items";

/**
 * Where a validation message is shown, in the order the fields appear on the page:
 * the sheet from top to bottom first, then the side column.
 */
export const DOCUMENT_ERROR_KEYS = [
  "customer",
  "servicePeriod",
  "items",
  "linePeriod",
  "quantity",
  "name",
  "exchangeRate",
  "reverseCharge",
] as const;

export type DocumentErrorKey = (typeof DOCUMENT_ERROR_KEYS)[number];
export type DocumentErrors = Partial<Record<DocumentErrorKey, string>>;

export const MISSING_CUSTOMER_MESSAGE = "Wähle einen Kunden aus.";
export const MISSING_NAME_MESSAGE = "Vergib eine Bezeichnung.";
const NO_ITEMS_MESSAGE = "Mindestens eine Position ist erforderlich.";
const NO_BILLABLE_ITEM_MESSAGE = "Mindestens eine Position mit Beschreibung und Preis ist erforderlich.";

export type DocumentFormState = {
  /** Set for documents that carry an internal name (recurring templates). */
  name?: string;
  customerId: number | null;
  customer: { vatId: string | null } | null;
  items: LineItemForm[];
  /** Offers need a position that is worth something; invoices only need one position. */
  itemsRule: "any" | "billable";
  /** Null while the settings load. */
  sender: ReverseChargeSender | null;
  reverseChargeType: ReverseChargeType;
  /** Absent for documents without a foreign currency (recurring templates). */
  currency?: { code: string; exchangeRate: string };
  /** Set while the form works with a service period. */
  servicePeriod?: { startIso: string; endIso: string };
};

function itemsError(items: LineItemForm[], rule: DocumentFormState["itemsRule"]): string | null {
  if (items.length === 0) return NO_ITEMS_MESSAGE;
  if (rule === "billable" && !items.some((it) => it.description.trim() !== "" && it.unitPrice > 0)) {
    return NO_BILLABLE_ITEM_MESSAGE;
  }
  return null;
}

/** Every problem of the form, each under the key of the field it belongs to. */
export function documentErrors(form: DocumentFormState): DocumentErrors {
  const found: Record<DocumentErrorKey, string | null> = {
    name: form.name !== undefined && !form.name.trim() ? MISSING_NAME_MESSAGE : null,
    customer: form.customerId === null ? MISSING_CUSTOMER_MESSAGE : null,
    items: itemsError(form.items, form.itemsRule),
    reverseCharge: form.sender
      ? reverseChargeError(form.reverseChargeType, form.sender, form.customer, form.items)
      : null,
    exchangeRate: form.currency ? exchangeRateError(form.currency.code, form.currency.exchangeRate) : null,
    servicePeriod: form.servicePeriod ? servicePeriodError(form.servicePeriod.startIso, form.servicePeriod.endIso) : null,
    linePeriod: linePeriodError(form.items),
    quantity: quantityError(form.items),
  };
  return Object.fromEntries(Object.entries(found).filter(([, message]) => message)) as DocumentErrors;
}

/** The message of the first field on the sheet that has a problem. */
export function firstError(errors: DocumentErrors): string | null {
  const key = DOCUMENT_ERROR_KEYS.find((candidate) => errors[candidate]);
  return key ? (errors[key] ?? null) : null;
}
