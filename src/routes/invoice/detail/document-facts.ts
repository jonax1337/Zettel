import type { Invoice, Offer } from "$lib/db/schema";
import { formatDate } from "$lib/utils/date";
import { displayInvoiceNumber, isDraftNumber } from "$lib/utils/invoice-number";
import { centsToEur } from "$lib/utils/money";
import { SUPPLY_KIND_LABEL } from "../supply-kind";

export type Fact = { label: string; value: string; mono?: boolean };

type InvoiceFactsSource = Pick<
  Invoice,
  | "number"
  | "status"
  | "sentAt"
  | "paidAt"
  | "reverseChargeType"
  | "supplyKind"
  | "buyerReference"
  | "currency"
  | "exchangeRate"
  | "eurTotalCent"
>;

type OfferFactsSource = Pick<Offer, "sentAt" | "acceptedAt" | "rejectedAt" | "isReverseCharge" | "supplyKind">;

/** What the sheet leaves out: when it was sent and paid, the foreign-currency booking, the references. */
export function invoiceFacts(invoice: InvoiceFactsSource): Fact[] {
  const facts: Fact[] = [];
  if (invoice.status === "draft" && isDraftNumber(invoice.number)) {
    facts.push({ label: "Kennung", value: displayInvoiceNumber(invoice), mono: true });
  }
  if (invoice.sentAt) facts.push({ label: "Versendet", value: formatDate(invoice.sentAt) });
  if (invoice.paidAt) facts.push({ label: "Bezahlt", value: formatDate(invoice.paidAt) });
  if (invoice.reverseChargeType !== "none") {
    facts.push({ label: "Art des Umsatzes", value: SUPPLY_KIND_LABEL[invoice.supplyKind] });
  }
  if (invoice.buyerReference) facts.push({ label: "Käuferreferenz", value: invoice.buyerReference, mono: true });
  if (invoice.currency && invoice.currency !== "EUR") {
    facts.push({ label: "Währung", value: invoice.currency });
    if (invoice.exchangeRate) {
      facts.push({ label: "Wechselkurs", value: `1 EUR = ${invoice.exchangeRate} ${invoice.currency}`, mono: true });
    }
    if (invoice.eurTotalCent != null) {
      facts.push({ label: "Gesamt (EUR)", value: centsToEur(invoice.eurTotalCent), mono: true });
    }
  }
  return facts;
}

export function offerFacts(offer: OfferFactsSource): Fact[] {
  const facts: Fact[] = [];
  if (offer.sentAt) facts.push({ label: "Versendet", value: formatDate(offer.sentAt) });
  if (offer.acceptedAt) facts.push({ label: "Angenommen", value: formatDate(offer.acceptedAt) });
  if (offer.rejectedAt) facts.push({ label: "Abgelehnt", value: formatDate(offer.rejectedAt) });
  if (offer.isReverseCharge) facts.push({ label: "Art des Umsatzes", value: SUPPLY_KIND_LABEL[offer.supplyKind] });
  return facts;
}

type InvoiceDatesSource = Pick<
  Invoice,
  "isCreditNote" | "issueDate" | "dueDate" | "servicePeriodStart" | "servicePeriodEnd" | "deliveryDate"
>;

type OfferDatesSource = Pick<Offer, "issueDate" | "validUntil" | "servicePeriodStart" | "servicePeriodEnd">;

function servicePeriodFact(start: number | null, end: number | null): Fact[] {
  return start && end ? [{ label: "Leistungszeitraum", value: `${formatDate(start)} – ${formatDate(end)}` }] : [];
}

/** The dates the sheet prints; the fallback without a sheet shows them as a list. */
export function invoiceSheetDates(invoice: InvoiceDatesSource): Fact[] {
  const facts: Fact[] = [
    { label: invoice.isCreditNote ? "Stornodatum" : "Rechnungsdatum", value: formatDate(invoice.issueDate) },
  ];
  if (!invoice.isCreditNote) facts.push({ label: "Fällig am", value: formatDate(invoice.dueDate) });
  const period = servicePeriodFact(invoice.servicePeriodStart, invoice.servicePeriodEnd);
  if (period.length > 0) return [...facts, ...period];
  return invoice.deliveryDate ? [...facts, { label: "Leistungsdatum", value: formatDate(invoice.deliveryDate) }] : facts;
}

export function offerSheetDates(offer: OfferDatesSource): Fact[] {
  return [
    { label: "Angebotsdatum", value: formatDate(offer.issueDate) },
    { label: "Gültig bis", value: formatDate(offer.validUntil) },
    ...servicePeriodFact(offer.servicePeriodStart, offer.servicePeriodEnd),
  ];
}
