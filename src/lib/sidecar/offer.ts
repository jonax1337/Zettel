import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { execute } from "$lib/db/client";
import { getOffer } from "$lib/db/offers";
import { loadSettings } from "$lib/db/queries";
import type { CustomerSnapshot, Offer, OfferItem, Settings } from "$lib/db/schema";
import type { SidecarResponse } from "./invoice";

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "_");
}

async function buildOutputPath(offer: Offer): Promise<string> {
  const home = await homeDir();
  return join(home, "Documents", "Zettel", "Angebote", `${safeFilename(offer.number)}.pdf`);
}

function buildPayload(opts: {
  offer: Offer;
  items: OfferItem[];
  customer: CustomerSnapshot;
  company: Settings;
  outputPath: string;
}) {
  const { offer, items, customer, company, outputPath } = opts;
  return {
    offer: {
      number: offer.number,
      issueDate: offer.issueDate,
      validUntil: offer.validUntil,
      subtotal: offer.subtotal,
      vatAmount: offer.vatAmount,
      total: offer.total,
      isKleinunternehmer: offer.isKleinunternehmer,
      isReverseCharge: offer.isReverseCharge,
      notes: offer.notes,
      introText: offer.introText,
      servicePeriodStart: offer.servicePeriodStart,
      servicePeriodEnd: offer.servicePeriodEnd,
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
    settings: {
      pdf_theme: company.pdfTheme ?? "classic",
    },
  };
}

export async function generateOfferPdf(offerId: number): Promise<SidecarResponse> {
  const data = await getOffer(offerId);
  if (!data) throw new Error(`Offer ${offerId} not found`);
  const company = await loadSettings();
  let customer: CustomerSnapshot;
  try {
    customer = JSON.parse(data.offer.customerSnapshot);
  } catch {
    throw new Error("Customer snapshot is corrupt — cannot render PDF.");
  }
  const outputPath = await buildOutputPath(data.offer);
  const payload = buildPayload({
    offer: data.offer,
    items: data.items,
    customer,
    company,
    outputPath,
  });

  const response = (await invoke<SidecarResponse>("generate_offer", { payload })) as SidecarResponse;

  if (response.success) {
    await execute("UPDATE offers SET pdf_path = ?, updated_at = unixepoch() WHERE id = ?", [
      response.pdfPath,
      offerId,
    ]);
  }
  return response;
}
