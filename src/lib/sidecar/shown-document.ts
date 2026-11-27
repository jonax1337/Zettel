import type { CustomerSnapshot, Invoice } from "$lib/db/schema";
import { buildCustomerSnapshot } from "$lib/db/snapshots";
import { displayInvoiceNumber } from "$lib/utils/invoice-number";
import { parseCustomerSnapshot } from "./payload";

/** The payload builders ask for the PDF's target path; a sheet writes nothing and a preview's place is chosen by the host. */
export const NO_OUTPUT_PATH = "";

/**
 * What an invoice shows where its number goes: the placeholder of a draft that was never
 * numbered (a discarded one too) reads "Entwurf #<4 hex>", a real number stays.
 */
export function shownInvoiceNumber(number: string): string {
  return displayInvoiceNumber({ number, status: "draft" });
}

/**
 * An invoice as the sheet and the PDF preview show it, so both agree. Issuing a draft
 * rebuilds its customer snapshot from the current customer, so the shown draft gets the
 * same snapshot, built in memory and never saved. Any other invoice keeps its stored one.
 */
export async function invoiceAsShown(
  invoice: Invoice,
): Promise<{ invoice: Invoice; customer: CustomerSnapshot }> {
  const customer =
    invoice.status === "draft"
      ? await buildCustomerSnapshot(invoice.customerId)
      : parseCustomerSnapshot(invoice.customerSnapshot);
  return { invoice: { ...invoice, number: shownInvoiceNumber(invoice.number) }, customer };
}
