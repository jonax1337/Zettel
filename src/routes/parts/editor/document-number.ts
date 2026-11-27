import { isDraftNumber } from "$lib/utils/invoice-number";

/** The number a stored invoice already carries, or null while it only has the draft placeholder. */
export function assignedInvoiceNumber(storedNumber: string | null): string | null {
  return storedNumber !== null && storedNumber !== "" && !isDraftNumber(storedNumber) ? storedNumber : null;
}
