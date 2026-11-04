import { recordInvoiceValidation } from "$lib/db/invoices";
import type { ValidationReport } from "$lib/validator";

export type StoredValidationStatus = "valid" | "invalid";

export async function storeInvoiceValidation(
  invoiceId: number,
  report: ValidationReport,
): Promise<StoredValidationStatus> {
  const status: StoredValidationStatus = report.valid ? "valid" : "invalid";
  await recordInvoiceValidation(invoiceId, status, report.findings.length);
  return status;
}
