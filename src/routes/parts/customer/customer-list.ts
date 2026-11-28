import { EMPTY_INVOICE_FIGURES, type InvoiceFigures } from "$lib/db/customer-overview";
import type { Customer } from "$lib/db/schema";

export type CustomerListRow = Customer & InvoiceFigures;

/** Joins the aggregated invoice figures onto the customers; a customer without invoices gets empty figures. */
export function withFigures(customers: readonly Customer[], figures: ReadonlyMap<number, InvoiceFigures>): CustomerListRow[] {
  return customers.map((customer) => ({ ...customer, ...(figures.get(customer.id) ?? EMPTY_INVOICE_FIGURES) }));
}
