import type { Invoice, InvoiceStatus, Offer, OfferStatus } from "$lib/db/schema";
import { displayInvoiceNumber } from "$lib/utils/invoice-number";
import { isOverdue } from "../../invoice/invoice-actions";
import { overdueDays } from "../../invoice/list-support";

export type DocumentFilter = "all" | "invoices" | "offers";

export const DOCUMENT_FILTER_ITEMS: { value: DocumentFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "invoices", label: "Rechnungen" },
  { value: "offers", label: "Angebote" },
];

type InvoiceSource = Pick<
  Invoice,
  "id" | "number" | "status" | "issueDate" | "dueDate" | "total" | "currency" | "isCreditNote" | "amountPaidCent"
> & { settledByCreditNote: boolean };

type OfferSource = Pick<Offer, "id" | "number" | "status" | "issueDate" | "total" | "currency">;

type DocumentBase = {
  key: string;
  id: number;
  number: string;
  date: number;
  href: string;
  /** Signed, in the document's own currency: credit notes are negative. */
  total: number;
  currency: string;
};

export type InvoiceDocument = DocumentBase & {
  kind: "invoice";
  status: InvoiceStatus;
  isCreditNote: boolean;
  /** Whole days past the due date, or null while the invoice is not overdue. */
  daysOverdue: number | null;
};

export type OfferDocument = DocumentBase & { kind: "offer"; status: OfferStatus };

export type CustomerDocument = InvoiceDocument | OfferDocument;

export function kindLabel(document: CustomerDocument): string {
  if (document.kind === "offer") return "Angebot";
  return document.isCreditNote ? "Stornorechnung" : "Rechnung";
}

function invoiceDocument(invoice: InvoiceSource, now: number): InvoiceDocument {
  return {
    kind: "invoice",
    key: `invoice-${invoice.id}`,
    id: invoice.id,
    number: displayInvoiceNumber(invoice),
    date: invoice.issueDate,
    href: `/invoices/${invoice.id}`,
    total: invoice.total,
    currency: invoice.currency,
    status: invoice.status,
    isCreditNote: invoice.isCreditNote,
    daysOverdue: isOverdue(invoice, invoice.settledByCreditNote, now) ? overdueDays(invoice.dueDate, now) : null,
  };
}

function offerDocument(offer: OfferSource): OfferDocument {
  return {
    kind: "offer",
    key: `offer-${offer.id}`,
    id: offer.id,
    number: offer.number,
    date: offer.issueDate,
    href: `/offers/${offer.id}`,
    total: offer.total,
    currency: offer.currency,
    status: offer.status,
  };
}

/** Invoices and offers of one customer in one list, newest first. */
export function customerDocuments(
  invoices: readonly InvoiceSource[],
  offers: readonly OfferSource[],
  now: number,
): CustomerDocument[] {
  const documents = [...invoices.map((i) => invoiceDocument(i, now)), ...offers.map(offerDocument)];
  return documents.sort((a, b) => b.date - a.date || b.id - a.id || a.kind.localeCompare(b.kind));
}

export function filterDocuments(documents: readonly CustomerDocument[], filter: DocumentFilter): CustomerDocument[] {
  if (filter === "all") return [...documents];
  const wanted = filter === "invoices" ? "invoice" : "offer";
  return documents.filter((d) => d.kind === wanted);
}
