import { invoke } from "@tauri-apps/api/core";
import { getInvoice } from "$lib/db/invoices";
import { getOffer } from "$lib/db/offers";
import { loadSettings } from "$lib/db/queries";
import { getReminder } from "$lib/db/reminders";
import { buildInvoicePayload, findCorrectedInvoice } from "./invoice";
import { buildOfferPayload } from "./offer";
import { parseCustomerSnapshot } from "./payload";
import { invoiceAsShown, NO_OUTPUT_PATH } from "./shown-document";
import { buildReminderPayload, loadReminderContext, storedSnapshotOrRebuilt } from "./reminder";
import type { SidecarError } from "./types";

type DocumentKind = "invoice" | "offer" | "reminder";
type SheetSuccess = { success: true; html: string };

/**
 * The sheets only read: unlike the PDF path they never issue a draft, draw a
 * number, archive or record anything. The HTML comes from the same templates
 * as the PDF.
 */
async function renderSheet(kind: DocumentKind, payload: object): Promise<string> {
  const response = await invoke<SheetSuccess | SidecarError>("render_document_html", {
    payload: { ...payload, kind },
  });
  if (!response.success) throw new Error(response.error.message);
  return response.html;
}

export async function renderInvoiceSheet(invoiceId: number): Promise<string> {
  const data = await getInvoice(invoiceId);
  if (!data) throw new Error(`Invoice ${invoiceId} not found`);
  const { invoice: shown, customer } = await invoiceAsShown(data.invoice);
  return renderSheet(
    "invoice",
    buildInvoicePayload({
      invoice: shown,
      items: data.items,
      customer,
      company: await loadSettings(),
      outputPath: NO_OUTPUT_PATH,
      correctsInvoice: await findCorrectedInvoice(data.invoice),
    }),
  );
}

export async function renderOfferSheet(offerId: number): Promise<string> {
  const data = await getOffer(offerId);
  if (!data) throw new Error(`Offer ${offerId} not found`);
  return renderSheet(
    "offer",
    buildOfferPayload({
      offer: data.offer,
      items: data.items,
      customer: parseCustomerSnapshot(data.offer.customerSnapshot),
      company: await loadSettings(),
      outputPath: NO_OUTPUT_PATH,
    }),
  );
}

export async function renderReminderSheet(reminderId: number): Promise<string> {
  const { reminder, invoice } = await loadReminderContext(reminderId);
  return renderSheet(
    "reminder",
    buildReminderPayload({
      reminder,
      invoice,
      snapshot: storedSnapshotOrRebuilt(reminder, invoice),
      company: await loadSettings(),
      outputPath: NO_OUTPUT_PATH,
    }),
  );
}
