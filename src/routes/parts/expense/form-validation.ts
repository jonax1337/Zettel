import type { ExpenseFormState } from "./expense-form";

export type ExpenseFormErrors = {
  vendor?: string;
  issueDate?: string;
  /** The message below the table; the row lists name the controls to mark. */
  items?: string;
  descriptionRows?: number[];
  quantityRows?: number[];
};

/** Messages sit next to the field they belong to, so each problem is reported separately. */
export function validateExpenseForm(
  form: Pick<ExpenseFormState, "vendorId" | "issueDateIso" | "items">,
): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  if (!form.vendorId) errors.vendor = "Wähle einen Lieferanten aus.";
  if (!form.issueDateIso) errors.issueDate = "Trage das Rechnungsdatum ein.";
  const rowsWhere = (isBad: (item: ExpenseFormState["items"][number]) => boolean) =>
    form.items.flatMap((item, index) => (isBad(item) ? [index] : []));
  const descriptionRows = rowsWhere((item) => !item.description.trim());
  const quantityRows = rowsWhere((item) => !Number.isFinite(item.quantity));
  if (descriptionRows.length > 0) errors.descriptionRows = descriptionRows;
  if (quantityRows.length > 0) errors.quantityRows = quantityRows;
  if (descriptionRows.length > 0) errors.items = `Beschreibe Position ${descriptionRows[0] + 1}.`;
  else if (quantityRows.length > 0) errors.items = `Trage bei Position ${quantityRows[0] + 1} eine Menge ein.`;
  return errors;
}

export function hasErrors(errors: ExpenseFormErrors): boolean {
  return Object.keys(errors).length > 0;
}
