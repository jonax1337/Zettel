import { homeDir, join } from "@tauri-apps/api/path";
import type { CustomerSnapshot, InvoiceItem, OfferItem, Settings } from "$lib/db/schema";
import type { SkontoResult } from "$lib/utils/skonto";

export type DocumentFolder = "Rechnungen" | "Angebote" | "Mahnungen";

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_");
}

export async function documentOutputPath(folder: DocumentFolder, number: string): Promise<string> {
  const home = await homeDir();
  return join(home, "Documents", "Zettel", folder, `${safeFilename(number)}.pdf`);
}

export function parseCustomerSnapshot(json: string): CustomerSnapshot {
  try {
    return JSON.parse(json);
  } catch (cause) {
    throw new Error("Customer snapshot is corrupt — cannot render PDF.", { cause });
  }
}

export function companyContactPayload(company: Settings) {
  return {
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
    logoPath: company.logoPath,
  };
}

export function companyBankPayload(company: Settings) {
  return {
    bankName: company.bankName,
    bankIban: company.bankIban,
    bankBic: company.bankBic,
  };
}

export function companyKleinunternehmerPayload(company: Settings) {
  return {
    isKleinunternehmer: company.isKleinunternehmer,
    kleinunternehmerNote: company.kleinunternehmerNote,
  };
}

export function customerPayload(customer: CustomerSnapshot) {
  return {
    name: customer.name,
    contactPerson: customer.contactPerson,
    street: customer.street,
    postalCode: customer.postalCode,
    city: customer.city,
    country: customer.country,
    vatId: customer.vatId,
  };
}

export function itemsPayload(items: Array<InvoiceItem | OfferItem>) {
  return items.map((it) => ({
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
  }));
}

export function skontoPayload(skonto: SkontoResult | null) {
  return {
    skontoPercent: skonto?.percent ?? null,
    skontoDays: skonto?.days ?? null,
    skontoAmountCent: skonto?.discountCent ?? null,
    skontoDeadline: skonto?.deadlineUnix ?? null,
  };
}

export function pdfSettingsPayload(company: Settings) {
  return { pdf_theme: company.pdfTheme ?? "classic" };
}
