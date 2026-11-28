import type { Invoice, Offer } from "$lib/db/schema";
import { formatDate } from "$lib/utils/date";
import { displayInvoiceNumber, isDraftNumber } from "$lib/utils/invoice-number";
import { hasOwnNumber } from "./issue-wording";

type NoteSource = Pick<Invoice, "status" | "isCreditNote" | "number" | "issueDate" | "dueDate" | "paidAt">;

/** The date that matters for the invoice's current state, for the line under the title. */
export function invoiceDateNote(invoice: NoteSource): string | null {
  if (invoice.status === "draft") return draftNote(invoice);
  if (invoice.status === "cancelled") return null;
  if (invoice.status === "paid") return invoice.paidAt ? `bezahlt am ${formatDate(invoice.paidAt)}` : null;
  if (invoice.isCreditNote) return `Stornodatum ${formatDate(invoice.issueDate)}`;
  return `fällig am ${formatDate(invoice.dueDate)}`;
}

function draftNote(invoice: Pick<NoteSource, "isCreditNote" | "number">): string {
  if (hasOwnNumber(invoice)) return "wieder geöffnet, behält beim Ausstellen ihre Nummer";
  return invoice.isCreditNote ? "noch ohne Nummer" : "noch ohne Rechnungsnummer";
}

type TitleSource = Pick<Invoice, "status" | "isCreditNote" | "number">;

/** A reopened draft keeps the number it was issued under; only a never-numbered one is just "Rechnungsentwurf". */
export function invoiceTitle(invoice: TitleSource): string {
  if (invoice.isCreditNote) return `Storno ${displayInvoiceNumber(invoice)}`;
  if (invoice.status === "draft" && isDraftNumber(invoice.number)) return "Rechnungsentwurf";
  return displayInvoiceNumber(invoice);
}

type OfferNoteSource = Pick<Offer, "status" | "validUntil" | "acceptedAt" | "rejectedAt">;

export function offerDateNote(offer: OfferNoteSource): string | null {
  switch (offer.status) {
    case "draft":
      return null;
    case "sent":
      return `gültig bis ${formatDate(offer.validUntil)}`;
    case "accepted":
      return offer.acceptedAt ? `angenommen am ${formatDate(offer.acceptedAt)}` : null;
    case "rejected":
      return offer.rejectedAt ? `abgelehnt am ${formatDate(offer.rejectedAt)}` : null;
    case "expired":
      return `abgelaufen am ${formatDate(offer.validUntil)}`;
  }
}
