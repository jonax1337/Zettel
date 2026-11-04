import { invoke } from "@tauri-apps/api/core";
import { execute } from "$lib/db/client";
import { getOffer } from "$lib/db/offers";
import { loadSettings } from "$lib/db/queries";
import type { CustomerSnapshot, Offer, OfferItem, Settings } from "$lib/db/schema";
import { computeSkonto } from "$lib/utils/skonto";
import {
  companyContactPayload,
  companyKleinunternehmerPayload,
  customerPayload,
  documentOutputPath,
  itemsPayload,
  parseCustomerSnapshot,
  pdfSettingsPayload,
  skontoPayload,
} from "./payload";
import type { SidecarResponse } from "./types";

function buildPayload(opts: {
  offer: Offer;
  items: OfferItem[];
  customer: CustomerSnapshot;
  company: Settings;
  outputPath: string;
}) {
  const { offer, items, customer, company, outputPath } = opts;
  const skonto = computeSkonto({
    totalCent: Math.abs(offer.total),
    percent: offer.skontoPercent,
    days: offer.skontoDays,
    issueDate: offer.issueDate,
    isCreditNote: false,
  });
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
      reverseChargeType: offer.reverseChargeType,
      supplyKind: offer.supplyKind,
      notes: offer.notes,
      introText: offer.introText,
      servicePeriodStart: offer.servicePeriodStart,
      servicePeriodEnd: offer.servicePeriodEnd,
      ...skontoPayload(skonto),
      pdfLanguage: offer.pdfLanguage ?? "de",
    },
    items: itemsPayload(items),
    company: {
      ...companyContactPayload(company),
      ...companyKleinunternehmerPayload(company),
    },
    customer: customerPayload(customer),
    outputPath,
    settings: pdfSettingsPayload(company),
  };
}

export async function generateOfferPdf(offerId: number): Promise<SidecarResponse> {
  const data = await getOffer(offerId);
  if (!data) throw new Error(`Offer ${offerId} not found`);
  const company = await loadSettings();
  const customer = parseCustomerSnapshot(data.offer.customerSnapshot);
  const outputPath = await documentOutputPath("Angebote", data.offer.number);
  const payload = buildPayload({
    offer: data.offer,
    items: data.items,
    customer,
    company,
    outputPath,
  });

  const response = await invoke<SidecarResponse>("generate_offer", { payload });

  if (response.success) {
    await execute("UPDATE offers SET pdf_path = ?, updated_at = unixepoch() WHERE id = ?", [
      response.pdfPath,
      offerId,
    ]);
  }
  return response;
}
