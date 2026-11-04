import { invoke } from "@tauri-apps/api/core";
import {
  getInvoice,
  isDraftNumber,
  issueInvoice,
  recordGeneratedPdf,
  type ValidationOutcome,
} from "$lib/db/invoices";
import { loadSettings } from "$lib/db/queries";
import type { CustomerSnapshot, Invoice, InvoiceItem, Settings } from "$lib/db/schema";
import { computeSkonto } from "$lib/utils/skonto";
import { validatePdf, type ValidationReport } from "$lib/validator";
import {
  companyBankPayload,
  companyContactPayload,
  companyKleinunternehmerPayload,
  customerPayload,
  documentOutputPath,
  itemsPayload,
  parseCustomerSnapshot,
  pdfSettingsPayload,
  skontoPayload,
} from "./payload";
import { companyIncompleteResponse } from "./company-guard";
import type { SidecarSuccess, SidecarResponse } from "./types";

export type { SidecarError, SidecarResponse, SidecarSuccess } from "./types";

type InvoiceWithItems = { invoice: Invoice; items: InvoiceItem[] };
type CorrectedInvoice = { number: string; issueDate: number };

function buildPayload(opts: {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: CustomerSnapshot;
  company: Settings;
  outputPath: string;
  correctsInvoice: CorrectedInvoice | null;
}) {
  const { invoice, items, customer, company, outputPath, correctsInvoice } = opts;
  const skonto = computeSkonto({
    totalCent: Math.abs(invoice.total),
    percent: invoice.skontoPercent,
    days: invoice.skontoDays,
    issueDate: invoice.issueDate,
    isCreditNote: invoice.isCreditNote,
  });
  return {
    invoice: {
      number: invoice.number,
      issueDate: invoice.issueDate,
      deliveryDate: invoice.deliveryDate,
      dueDate: invoice.dueDate,
      subtotal: invoice.subtotal,
      vatAmount: invoice.vatAmount,
      total: invoice.total,
      isKleinunternehmer: invoice.isKleinunternehmer,
      isReverseCharge: invoice.isReverseCharge,
      reverseChargeType: invoice.reverseChargeType,
      supplyKind: invoice.supplyKind,
      isCreditNote: invoice.isCreditNote,
      correctsInvoice,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      currency: invoice.currency ?? "EUR",
      exchangeRate: invoice.exchangeRate,
      eurTotalCent: invoice.eurTotalCent,
      servicePeriodStart: invoice.servicePeriodStart,
      servicePeriodEnd: invoice.servicePeriodEnd,
      ...skontoPayload(skonto),
      amountPaidCent: invoice.amountPaidCent ?? 0,
      pdfLanguage: invoice.pdfLanguage ?? "de",
    },
    items: itemsPayload(items),
    company: {
      ...companyContactPayload(company),
      ...companyBankPayload(company),
      ...companyKleinunternehmerPayload(company),
    },
    customer: customerPayload(customer),
    outputPath,
    profile: company.zugferdProfile ?? "en16931",
    settings: pdfSettingsPayload(company),
  };
}

/**
 * A draft still carrying a DRAFT-… placeholder must be issued before render:
 * PDFs are durable artifacts and must not reference placeholder numbers.
 */
async function loadInvoiceForRendering(invoiceId: number): Promise<InvoiceWithItems> {
  let data = await getInvoice(invoiceId);
  if (!data) throw new Error(`Invoice ${invoiceId} not found`);
  if (data.invoice.status === "draft" && isDraftNumber(data.invoice.number)) {
    await issueInvoice(invoiceId);
    data = await getInvoice(invoiceId);
    if (!data) throw new Error(`Invoice ${invoiceId} not found after issue`);
  }
  return data;
}

/**
 * Keeps the previous PDF (if any) before the sidecar overwrites it, so every
 * generation stays available as a version (audit trail). A failed archive must
 * never block PDF generation.
 */
async function archivePreviousPdf(outputPath: string): Promise<void> {
  try {
    await invoke("archive_pdf_version", { path: outputPath });
  } catch (error) {
    console.warn(`Could not archive previous PDF version of ${outputPath}:`, error);
  }
}

async function findCorrectedInvoice(invoice: Invoice): Promise<CorrectedInvoice | null> {
  if (!invoice.isCreditNote || !invoice.correctsInvoiceId) return null;
  const original = await getInvoice(invoice.correctsInvoiceId);
  if (!original) return null;
  return { number: original.invoice.number, issueDate: original.invoice.issueDate };
}

/**
 * Soft-gate: the validator being unavailable (Java or jar missing, no XML in
 * the PDF) never blocks PDF release; it is recorded as "unavailable" so the UI
 * can surface it.
 */
async function validateGeneratedPdf(
  pdfPath: string,
): Promise<{ report: ValidationReport | null; outcome: ValidationOutcome }> {
  try {
    const report = await validatePdf(pdfPath);
    return { report, outcome: report.valid ? "valid" : "invalid" };
  } catch {
    return { report: null, outcome: "unavailable" };
  }
}

async function validateAndRecord(response: SidecarSuccess, invoiceId: number): Promise<void> {
  const { report, outcome } = await validateGeneratedPdf(response.pdfPath);
  response.kositReport = report;
  await recordGeneratedPdf(invoiceId, response.pdfPath, outcome, report?.findings.length ?? null);
}

export async function generateInvoicePdf(invoiceId: number): Promise<SidecarResponse> {
  // Checked before loadInvoiceForRendering, which issues a draft (draws a real invoice number).
  const company = await loadSettings();
  const blocked = companyIncompleteResponse(company);
  if (blocked) return blocked;
  const { invoice, items } = await loadInvoiceForRendering(invoiceId);
  const customer = parseCustomerSnapshot(invoice.customerSnapshot);
  const outputPath = await documentOutputPath("Rechnungen", invoice.number);
  await archivePreviousPdf(outputPath);

  const payload = buildPayload({
    invoice,
    items,
    customer,
    company,
    outputPath,
    correctsInvoice: await findCorrectedInvoice(invoice),
  });
  const response = await invoke<SidecarResponse>("generate_invoice", { payload });

  if (response.success) {
    await validateAndRecord(response, invoiceId);
  }
  return response;
}

export type PdfVersion = {
  path: string;
  modifiedUnix: number;
  current: boolean;
};

/** All preserved versions of an invoice PDF (current + archived), newest first. */
export async function listPdfVersions(pdfPath: string): Promise<PdfVersion[]> {
  return invoke<PdfVersion[]>("list_pdf_versions", { path: pdfPath });
}

export async function pingSidecar(): Promise<SidecarResponse> {
  return invoke<SidecarResponse>("ping_sidecar");
}
