import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { execute } from "$lib/db/client";
import { getInvoice } from "$lib/db/invoices";
import { loadSettings } from "$lib/db/queries";
import type { CustomerSnapshot, Invoice, InvoiceItem, Settings } from "$lib/db/schema";

export type SidecarSuccess = {
  success: true;
  pdfPath: string;
  validationWarnings: string[];
  validationErrors: string[];
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
    },
    items: items.map((it) => ({
      position: it.position,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
      lineTotal: it.lineTotal,
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
  };
}

export async function generateInvoicePdf(invoiceId: number): Promise<SidecarResponse> {
  const data = await getInvoice(invoiceId);
  if (!data) throw new Error(`Invoice ${invoiceId} not found`);
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
    await execute("UPDATE invoices SET pdf_path = ?, updated_at = unixepoch() WHERE id = ?", [
      response.pdfPath,
      invoiceId,
    ]);
  }
  return response;
}

export async function pingSidecar(): Promise<SidecarResponse> {
  return invoke<SidecarResponse>("ping_sidecar");
}
