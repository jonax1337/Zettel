import type { Vendor } from "$lib/db/schema";
import {
  extractTextPdf,
  extractZugferd,
  type ExtractedInvoice,
  type ExtractedText,
} from "$lib/sidecar/extract";
import { validatePdf } from "$lib/validator";
import { findVendorByName, findVendorByNameLoosely, findVendorByVatId } from "./vendor-match";

export type PdfReadOutcome =
  | { kind: "zugferd"; data: ExtractedInvoice; vendor: Vendor | null }
  | { kind: "text"; data: ExtractedText; vendor: Vendor | null }
  | { kind: "empty" }
  | { kind: "extract-failed"; message: string };

export type ImportValidation = {
  status: "valid" | "invalid" | "unavailable";
  findingsCount: number | null;
};

/** Reads structured ZUGFeRD data from the PDF and falls back to text heuristics when it has none. */
export async function readExpensePdf(srcPath: string, vendors: Vendor[]): Promise<PdfReadOutcome> {
  const zugferd = await extractZugferd(srcPath);
  if (!zugferd.success) return { kind: "extract-failed", message: zugferd.error.message };
  if (zugferd.found) {
    const { seller } = zugferd.data;
    const vendor = findVendorByVatId(vendors, seller.vatId) ?? findVendorByName(vendors, seller.name);
    return { kind: "zugferd", data: zugferd.data, vendor };
  }

  const text = await extractTextPdf(srcPath);
  if (text.success && text.found) {
    const vendor =
      findVendorByVatId(vendors, text.data.vendorVatId) ??
      findVendorByNameLoosely(vendors, text.data.vendorName);
    return { kind: "text", data: text.data, vendor };
  }
  return { kind: "empty" };
}

/** Checks the stored supplier XML against KoSIT; an unavailable validator shows up as "nicht validiert". */
export async function validateImportedPdf(pdfPath: string): Promise<ImportValidation> {
  try {
    const report = await validatePdf(pdfPath);
    return { status: report.valid ? "valid" : "invalid", findingsCount: report.findings.length };
  } catch {
    return { status: "unavailable", findingsCount: null };
  }
}
