import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { execute } from "$lib/db/client";
import { getInvoice, isDraftNumber, issueInvoice } from "$lib/db/invoices";
import { loadSettings } from "$lib/db/queries";
import type { CustomerSnapshot, Invoice, InvoiceItem, Settings } from "$lib/db/schema";
import { validatePdf, type ValidationReport } from "$lib/validator";
import { computeSkonto } from "$lib/utils/skonto";

export type SidecarSuccess = {
  success: true;
  pdfPath: string;
  validationWarnings: string[];
  validationErrors: string[];
  /** KoSIT report. null = validator unavailable (Java/jar missing). */
  kositReport?: ValidationReport | null;
};

export type SidecarError = {
  success: false;
  error: { code: string; message: string; details: string };
};

export type SidecarResponse = SidecarSuccess | SidecarError;

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_");
}

async function buildOutputPath(invoice: Invoice): Promise<string> {
  const home = await homeDir();
  return join(home, "Documents", "Zettel", "Rechnungen", `${safeFilename(invoice.number)}.pdf`);
}

function buildPayload(opts: {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: CustomerSnapshot;
  company: Settings;
  outputPath: string;
  correctsInvoice?: { number: string; issueDate: number } | null;
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
      isCreditNote: invoice.isCreditNote,
      correctsInvoice: correctsInvoice ?? null,
      notes: invoice.notes,
      paymentTerms: invoice.paymentTerms,
      currency: invoice.currency ?? "EUR",
      exchangeRate: invoice.exchangeRate,
      eurTotalCent: invoice.eurTotalCent,
      servicePeriodStart: invoice.servicePeriodStart,
      servicePeriodEnd: invoice.servicePeriodEnd,
      skontoPercent: skonto?.percent ?? null,
      skontoDays: skonto?.days ?? null,
      skontoAmountCent: skonto?.discountCent ?? null,
      skontoDeadline: skonto?.deadlineUnix ?? null,
    },
    items: items.map((it) => ({
      position: it.position,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
      lineTotal: it.lineTotal,
      longDescription: it.longDescription,
      linePeriodStart: it.linePeriodStart,
      linePeriodEnd: it.linePeriodEnd,
    })),
    company: {
      companyName: company.companyName,
      ownerName: company.ownerName,
      street: company.street,
      postalCode: company.postalCode,
      city: company.city,
      country: company.country,
      taxNumber: company.taxNumber,
      vatId: company.vatId,
      email: company.email,
      phone: company.phone,
      website: company.website,
      bankName: company.bankName,
      bankIban: company.bankIban,
      bankBic: company.bankBic,
      isKleinunternehmer: company.isKleinunternehmer,
      kleinunternehmerNote: company.kleinunternehmerNote,
      logoPath: company.logoPath,
    },
    customer: {
      name: customer.name,
      contactPerson: customer.contactPerson,
      street: customer.street,
      postalCode: customer.postalCode,
      city: customer.city,
      country: customer.country,
      vatId: customer.vatId,
    },
    outputPath,
    profile: company.zugferdProfile ?? "en16931",
    settings: {
      pdf_theme: company.pdfTheme ?? "classic",
    },
  };
}

export async function generateInvoicePdf(invoiceId: number): Promise<SidecarResponse> {
  let data = await getInvoice(invoiceId);
  if (!data) throw new Error(`Invoice ${invoiceId} not found`);
  // A draft still carrying a DRAFT-… placeholder must be issued before render.
  // PDFs are durable artifacts — they must not reference placeholder numbers.
  if (data.invoice.status === "draft" && isDraftNumber(data.invoice.number)) {
    await issueInvoice(invoiceId);
    data = await getInvoice(invoiceId);
    if (!data) throw new Error(`Invoice ${invoiceId} not found after issue`);
  }
  const company = await loadSettings();
  let customer: CustomerSnapshot;
  try {
    customer = JSON.parse(data.invoice.customerSnapshot);
  } catch {
    throw new Error("Customer snapshot is corrupt — cannot render PDF.");
  }
  const outputPath = await buildOutputPath(data.invoice);
  let correctsInvoice: { number: string; issueDate: number } | null = null;
  if (data.invoice.isCreditNote && data.invoice.correctsInvoiceId) {
    const orig = await getInvoice(data.invoice.correctsInvoiceId);
    if (orig) {
      correctsInvoice = { number: orig.invoice.number, issueDate: orig.invoice.issueDate };
    }
  }
  const payload = buildPayload({
    invoice: data.invoice,
    items: data.items,
    customer,
    company,
    outputPath,
    correctsInvoice,
  });

  const response = (await invoke<SidecarResponse>("generate_invoice", { payload })) as SidecarResponse;

  if (response.success) {
    // Soft-gate: validate the freshly written PDF against KoSIT and persist
    // outcome. We never block PDF release on validator unavailability — but
    // we record it, so the UI can surface it.
    let report: ValidationReport | null = null;
    let status: "valid" | "invalid" | "unavailable" = "unavailable";
    let findingsCount: number | null = null;
    try {
      report = await validatePdf(response.pdfPath);
      status = report.valid ? "valid" : "invalid";
      findingsCount = report.findings.length;
    } catch {
      // Validator missing, Java missing, no XML in PDF — leave as "unavailable".
    }
    response.kositReport = report;
    await execute(
      "UPDATE invoices SET pdf_path = ?, last_validation_status = ?, last_validated_at = unixepoch(), last_validation_findings_count = ?, updated_at = unixepoch() WHERE id = ?",
      [response.pdfPath, status, findingsCount, invoiceId],
    );
  }
  return response;
}

export async function pingSidecar(): Promise<SidecarResponse> {
  return invoke<SidecarResponse>("ping_sidecar");
}
