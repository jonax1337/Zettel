import { DEFAULT_CURRENCY, DEFAULT_PDF_LANGUAGE, mapDatedLineItem } from "./doc-queries";
import type { Invoice, InvoiceItem, InvoiceStatus } from "./schema";

/** snake_case as returned from SQLite. */
export type InvoiceRow = {
  id: number;
  number: string;
  customer_id: number;
  customer_snapshot: string;
  issue_date: number;
  delivery_date: number | null;
  due_date: number;
  status: InvoiceStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  is_kleinunternehmer: number;
  is_reverse_charge: number;
  reverse_charge_type: string | null;
  supply_kind: string;
  notes: string | null;
  payment_terms: string | null;
  pdf_path: string | null;
  is_credit_note: number | null;
  corrects_invoice_id: number | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
  paid_at: number | null;
  last_validation_status: string | null;
  last_validated_at: number | null;
  last_validation_findings_count: number | null;
  currency: string;
  exchange_rate: string | null;
  eur_total_cent: number | null;
  notes_internal: string | null;
  follow_up_date: number | null;
  service_period_start: number | null;
  service_period_end: number | null;
  skonto_percent: number | null;
  skonto_days: number | null;
  amount_paid_cent: number | null;
  pdf_language: string | null;
  buyer_reference: string | null;
};

export type InvoiceItemRow = {
  id: number;
  invoice_id: number;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
  long_description: string | null;
  line_period_start: number | null;
  line_period_end: number | null;
};

export function mapInvoice(r: InvoiceRow): Invoice {
  const reverseChargeType = (r.reverse_charge_type ?? "none") as Invoice["reverseChargeType"];
  return {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    customerSnapshot: r.customer_snapshot,
    issueDate: r.issue_date,
    deliveryDate: r.delivery_date,
    dueDate: r.due_date,
    status: r.status,
    subtotal: r.subtotal,
    vatAmount: r.vat_amount,
    total: r.total,
    isKleinunternehmer: r.is_kleinunternehmer === 1,
    isReverseCharge: reverseChargeType !== "none",
    reverseChargeType,
    supplyKind: r.supply_kind as Invoice["supplyKind"],
    notes: r.notes,
    paymentTerms: r.payment_terms,
    pdfPath: r.pdf_path,
    isCreditNote: r.is_credit_note === 1,
    correctsInvoiceId: r.corrects_invoice_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    paidAt: r.paid_at,
    lastValidationStatus: r.last_validation_status as Invoice["lastValidationStatus"],
    lastValidatedAt: r.last_validated_at,
    lastValidationFindingsCount: r.last_validation_findings_count,
    currency: r.currency ?? DEFAULT_CURRENCY,
    exchangeRate: r.exchange_rate,
    eurTotalCent: r.eur_total_cent,
    notesInternal: r.notes_internal,
    followUpDate: r.follow_up_date,
    servicePeriodStart: r.service_period_start,
    servicePeriodEnd: r.service_period_end,
    skontoPercent: r.skonto_percent,
    skontoDays: r.skonto_days,
    amountPaidCent: r.amount_paid_cent ?? 0,
    pdfLanguage: (r.pdf_language ?? DEFAULT_PDF_LANGUAGE) as Invoice["pdfLanguage"],
    buyerReference: r.buyer_reference,
  };
}

export function mapItem(r: InvoiceItemRow): InvoiceItem {
  return { id: r.id, invoiceId: r.invoice_id, ...mapDatedLineItem(r) };
}
