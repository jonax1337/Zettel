import { execute, insert, select } from "./client";
import {
  buildDocumentFilter,
  DEFAULT_CURRENCY,
  DEFAULT_PDF_LANGUAGE,
  datedLineColumns,
  listYears,
  mapDatedLineItem,
  MISSING_NAME,
  writeLineItems,
} from "./doc-queries";
import { createInvoice, deleteInvoice, orKeep } from "./invoices";
import type { InvoiceFormInput, ReverseChargeType, SupplyKind } from "./invoices";
import { storedReverseChargeType } from "./reverse-charge-type";
import { drawNextNumber } from "./numbering";
import { loadSettings } from "./queries";
import { buildCustomerSnapshot } from "./snapshots";
import type {
  Offer,
  OfferItem,
  OfferStatus,
} from "./schema";
import { computeEurTotalCent } from "$lib/utils/currency";
import { addDaysUnix, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
import { computeTotals } from "$lib/utils/totals";

const EXPIRING_SOON_DAYS = 7;
const OPEN_STATUSES_SQL = "('draft','sent')";
const DELETABLE_STATUSES: readonly OfferStatus[] = ["draft", "rejected", "expired"];

// --- Row types ---

type OfferRow = {
  id: number;
  number: string;
  customer_id: number;
  customer_snapshot: string;
  issue_date: number;
  valid_until: number;
  status: OfferStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  is_kleinunternehmer: number;
  is_reverse_charge: number;
  reverse_charge_type: string | null;
  supply_kind: string;
  notes: string | null;
  intro_text: string | null;
  pdf_path: string | null;
  converted_invoice_id: number | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
  accepted_at: number | null;
  rejected_at: number | null;
  currency: string;
  exchange_rate: string | null;
  service_period_start: number | null;
  service_period_end: number | null;
  skonto_percent: number | null;
  skonto_days: number | null;
  pdf_language: string | null;
};

type OfferItemRow = {
  id: number;
  offer_id: number;
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

export function mapOffer(r: OfferRow): Offer {
  return {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    customerSnapshot: r.customer_snapshot,
    issueDate: r.issue_date,
    validUntil: r.valid_until,
    status: r.status,
    subtotal: r.subtotal,
    vatAmount: r.vat_amount,
    total: r.total,
    isKleinunternehmer: r.is_kleinunternehmer === 1,
    isReverseCharge: r.is_reverse_charge === 1,
    reverseChargeType: storedReverseChargeType(r.reverse_charge_type, r.is_reverse_charge === 1),
    supplyKind: r.supply_kind as Offer["supplyKind"],
    notes: r.notes,
    introText: r.intro_text,
    pdfPath: r.pdf_path,
    convertedInvoiceId: r.converted_invoice_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    acceptedAt: r.accepted_at,
    rejectedAt: r.rejected_at,
    currency: r.currency ?? DEFAULT_CURRENCY,
    exchangeRate: r.exchange_rate,
    servicePeriodStart: r.service_period_start,
    servicePeriodEnd: r.service_period_end,
    skontoPercent: r.skonto_percent,
    skontoDays: r.skonto_days,
    pdfLanguage: (r.pdf_language ?? DEFAULT_PDF_LANGUAGE) as Offer["pdfLanguage"],
  };
}

function mapItem(r: OfferItemRow): OfferItem {
  return { id: r.id, offerId: r.offer_id, ...mapDatedLineItem(r) };
}

type OfferItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  longDescription?: string | null;
  linePeriodStart?: number | null;
  linePeriodEnd?: number | null;
  fixedLineTotal?: number;
};

export type OfferFormInput = {
  customerId: number;
  issueDate: number;
  validUntil: number;
  notes: string | null;
  introText: string | null;
  reverseChargeType: ReverseChargeType;
  supplyKind: SupplyKind;
  items: OfferItemInput[];
  currency?: string;
  exchangeRate?: string | null;
  servicePeriodStart?: number | null;
  servicePeriodEnd?: number | null;
  skontoPercent?: number | null;
  skontoDays?: number | null;
  pdfLanguage?: "de" | "en";
};

// --- List / get ---

export type OfferFilter = {
  status?: OfferStatus | "all";
  year?: number | "all";
  customerId?: number | "all";
  search?: string;
};

export type OfferListRow = Offer & { customerName: string };

function buildOfferFilter(filter: OfferFilter) {
  const { customerId, ...rest } = filter;
  return buildDocumentFilter("o", "customer_id", ["o.number", "c.name"], {
    ...rest,
    partyId: customerId,
  });
}

export async function listOffers(
  filter: OfferFilter = {},
): Promise<OfferListRow[]> {
  const { where, binds } = buildOfferFilter(filter);
  const rows = await select<OfferRow & { customer_name: string | null }>(
    `SELECT o.*, c.name AS customer_name
     FROM offers o
     LEFT JOIN customers c ON c.id = o.customer_id
     ${where}
     ORDER BY o.issue_date DESC, o.id DESC`,
    binds,
  );
  return rows.map((r) => ({
    ...mapOffer(r),
    customerName: r.customer_name ?? MISSING_NAME,
  }));
}

export async function getOffer(
  id: number,
): Promise<{ offer: Offer; items: OfferItem[] } | null> {
  const rows = await select<OfferRow>(
    "SELECT * FROM offers WHERE id = ?",
    [id],
  );
  if (!rows.length) return null;
  const itemRows = await select<OfferItemRow>(
    "SELECT * FROM offer_items WHERE offer_id = ? ORDER BY position ASC",
    [id],
  );
  return { offer: mapOffer(rows[0]), items: itemRows.map(mapItem) };
}

export const getOfferYears = () => listYears("offers");

// --- Mutations ---

function writeItems(offerId: number, items: OfferItemInput[]): Promise<void> {
  return writeLineItems("offer_items", "offer_id", offerId, items, datedLineColumns);
}

export async function createOffer(input: OfferFormInput): Promise<number> {
  const settings = await loadSettings();
  const snapshot = await buildCustomerSnapshot(input.customerId);
  const isReverseCharge = input.reverseChargeType !== "none";
  const totals = computeTotals(input.items, {
    isKleinunternehmer: settings.isKleinunternehmer,
    isReverseCharge,
  });
  const number = await drawNextNumber("offer", input.issueDate);

  const id = await insert(
    `INSERT INTO offers
      (number, customer_id, customer_snapshot, issue_date, valid_until,
       status, subtotal, vat_amount, total, is_kleinunternehmer, is_reverse_charge,
       reverse_charge_type, supply_kind, notes, intro_text, currency, exchange_rate,
       service_period_start, service_period_end, skonto_percent, skonto_days, pdf_language)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      number,
      input.customerId,
      JSON.stringify(snapshot),
      input.issueDate,
      input.validUntil,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      settings.isKleinunternehmer ? 1 : 0,
      isReverseCharge ? 1 : 0,
      input.reverseChargeType,
      input.supplyKind,
      input.notes,
      input.introText,
      input.currency ?? DEFAULT_CURRENCY,
      input.exchangeRate ?? null,
      input.servicePeriodStart ?? null,
      input.servicePeriodEnd ?? null,
      input.skontoPercent ?? null,
      input.skontoDays ?? null,
      input.pdfLanguage ?? settings.defaultPdfLanguage,
    ],
  );
  await writeItems(id, input.items);
  return id;
}

export async function updateOffer(
  id: number,
  input: OfferFormInput,
): Promise<void> {
  const existing = await getOffer(id);
  if (!existing) throw new Error(`Offer ${id} not found`);
  if (existing.offer.status !== "draft") {
    throw new Error("Nur Entwürfe können bearbeitet werden.");
  }
  const isReverseCharge = input.reverseChargeType !== "none";
  const totals = computeTotals(input.items, {
    isKleinunternehmer: existing.offer.isKleinunternehmer,
    isReverseCharge,
  });
  // Drafts follow the customer's master data until they are sent.
  const snapshotJson = JSON.stringify(await buildCustomerSnapshot(input.customerId));

  await execute(
    `UPDATE offers SET
      customer_id = ?, customer_snapshot = ?,
      issue_date = ?, valid_until = ?,
      subtotal = ?, vat_amount = ?, total = ?,
      is_reverse_charge = ?, reverse_charge_type = ?, supply_kind = ?,
      notes = ?, intro_text = ?,
      currency = ?, exchange_rate = ?,
      service_period_start = ?, service_period_end = ?,
      skonto_percent = ?, skonto_days = ?,
      pdf_language = ?,
      updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.customerId,
      snapshotJson,
      input.issueDate,
      input.validUntil,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      isReverseCharge ? 1 : 0,
      input.reverseChargeType,
      input.supplyKind,
      input.notes,
      input.introText,
      input.currency ?? existing.offer.currency,
      orKeep(input.exchangeRate, existing.offer.exchangeRate),
      input.servicePeriodStart ?? null,
      input.servicePeriodEnd ?? null,
      input.skontoPercent ?? null,
      input.skontoDays ?? null,
      input.pdfLanguage ?? existing.offer.pdfLanguage,
      id,
    ],
  );
  await writeItems(id, input.items);
}

export async function deleteOffer(id: number): Promise<void> {
  const existing = await getOffer(id);
  if (!existing) return;
  if (!DELETABLE_STATUSES.includes(existing.offer.status)) {
    throw new Error("Nur Entwürfe, abgelehnte oder abgelaufene Angebote können gelöscht werden.");
  }
  await execute("DELETE FROM offers WHERE id = ?", [id]);
}

// --- Status transitions ---

/** sentAt defaults to now; pass the original send date (unix seconds) when recording an offer after the fact. */
export async function markSent(id: number, sentAt?: number): Promise<void> {
  await execute(
    "UPDATE offers SET status = 'sent', sent_at = COALESCE(?, unixepoch()), updated_at = unixepoch() WHERE id = ? AND status = 'draft'",
    [sentAt ?? null, id],
  );
}

export async function markAccepted(id: number): Promise<void> {
  await execute(
    "UPDATE offers SET status = 'accepted', accepted_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status IN ('sent','draft')",
    [id],
  );
}

export async function markRejected(id: number): Promise<void> {
  await execute(
    "UPDATE offers SET status = 'rejected', rejected_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status IN ('sent','draft')",
    [id],
  );
}

export async function reopenDraft(id: number): Promise<void> {
  await execute(
    `UPDATE offers SET status = 'draft', sent_at = NULL, accepted_at = NULL, rejected_at = NULL, updated_at = unixepoch()
     WHERE id = ? AND (status IN ('sent','rejected','expired') OR (status = 'accepted' AND converted_invoice_id IS NULL))`,
    [id],
  );
}

/**
 * valid_until is local midnight of the last valid day ("Gültig bis" is
 * inclusive), so an offer only counts as lapsed once that day is over.
 */
function startOfTodayUnix(): number {
  return fromIsoDate(toIsoDate(nowUnix()));
}

/**
 * Auto-expire offers whose validity ended before today.
 * Called on dashboard / list load — cheap, idempotent.
 */
export async function expireDueOffers(): Promise<number> {
  const res = await execute(
    `UPDATE offers SET status = 'expired', updated_at = unixepoch() WHERE status IN ${OPEN_STATUSES_SQL} AND valid_until < ?`,
    [startOfTodayUnix()],
  );
  return res.rowsAffected ?? 0;
}

// --- Convert to invoice ---

function invoiceInputFromOffer(
  offer: Offer,
  items: OfferItem[],
  issueDate: number,
  dueDate: number,
): InvoiceFormInput {
  return {
    customerId: offer.customerId,
    issueDate,
    deliveryDate: null,
    dueDate,
    notes: offer.notes,
    paymentTerms: null,
    reverseChargeType: offer.reverseChargeType,
    supplyKind: offer.supplyKind,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
      longDescription: it.longDescription,
      linePeriodStart: it.linePeriodStart,
      linePeriodEnd: it.linePeriodEnd,
    })),
    currency: offer.currency,
    exchangeRate: offer.exchangeRate,
    servicePeriodStart: offer.servicePeriodStart,
    servicePeriodEnd: offer.servicePeriodEnd,
    skontoPercent: offer.skontoPercent,
    skontoDays: offer.skontoDays,
    pdfLanguage: offer.pdfLanguage,
  };
}

/**
 * Creates a fresh draft invoice from this offer's data and links it back.
 * Returns the new invoice ID. The offer is marked as accepted.
 *
 * The link is a conditional UPDATE: when a concurrent conversion (double
 * click) linked its invoice first, this call's draft is deleted again (it has
 * no number yet, so no gap) and the winner's invoice is returned.
 */
export async function convertToInvoice(
  offerId: number,
  opts: { paymentTermsDays?: number } = {},
): Promise<number> {
  const data = await getOffer(offerId);
  if (!data) throw new Error(`Offer ${offerId} not found`);
  if (data.offer.convertedInvoiceId) {
    throw new Error("Angebot wurde bereits in eine Rechnung umgewandelt.");
  }
  if (data.offer.status === "rejected") {
    throw new Error("Abgelehnte Angebote können nicht umgewandelt werden.");
  }

  const settings = await loadSettings();
  const paymentDays = opts.paymentTermsDays ?? settings.defaultPaymentTermsDays;
  const issueDate = nowUnix();
  const invoiceId = await createInvoice(
    invoiceInputFromOffer(data.offer, data.items, issueDate, addDaysUnix(issueDate, paymentDays)),
  );
  const link = await execute(
    `UPDATE offers SET status = 'accepted', accepted_at = COALESCE(accepted_at, unixepoch()),
       converted_invoice_id = ?, updated_at = unixepoch()
     WHERE id = ? AND converted_invoice_id IS NULL AND status != 'rejected'`,
    [invoiceId, offerId],
  );
  if (link.rowsAffected === 1) return invoiceId;

  await deleteInvoice(invoiceId);
  const winner = (await getOffer(offerId))?.offer.convertedInvoiceId;
  if (winner == null) throw new Error("Angebot konnte nicht umgewandelt werden.");
  return winner;
}

// --- Dashboard ---

export async function openOffersStats(): Promise<{
  count: number;
  total: number;
  /** Open offers left out of `total` because they have no usable exchange rate. */
  unconvertedCount: number;
  expiringSoonCount: number;
}> {
  const today = startOfTodayUnix();
  const openOffers = await select<{ total: number; currency: string | null; exchange_rate: string | null }>(
    `SELECT total, currency, exchange_rate FROM offers WHERE status IN ${OPEN_STATUSES_SQL}`,
  );
  // Foreign-currency offers count in EUR at their stored rate; without a usable rate they add nothing
  // rather than mixing currencies into one sum.
  let totalEur = 0;
  let unconvertedCount = 0;
  for (const o of openOffers) {
    const eur = computeEurTotalCent(o.currency ?? DEFAULT_CURRENCY, o.total, o.exchange_rate);
    if (eur === null) unconvertedCount += 1;
    else totalEur += eur;
  }
  const [soonRow] = await select<{ c: number }>(
    `SELECT COUNT(*) AS c FROM offers WHERE status IN ${OPEN_STATUSES_SQL} AND valid_until BETWEEN ? AND ?`,
    [today, addDaysUnix(today, EXPIRING_SOON_DAYS)],
  );
  return {
    count: openOffers.length,
    total: totalEur,
    unconvertedCount,
    expiringSoonCount: soonRow?.c ?? 0,
  };
}
