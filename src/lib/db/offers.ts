import { execute, getDb, select } from "./client";
import { createInvoice } from "./invoices";
import type { InvoiceFormInput } from "./invoices";
import { getCustomer, loadSettings } from "./queries";
import type {
  CustomerSnapshot,
  Offer,
  OfferItem,
  OfferStatus,
} from "./schema";
import { formatInvoiceNumber } from "$lib/utils/invoice-number";

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
  notes: string | null;
  intro_text: string | null;
  pdf_path: string | null;
  converted_invoice_id: number | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
  accepted_at: number | null;
  rejected_at: number | null;
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
};

function mapOffer(r: OfferRow): Offer {
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
    notes: r.notes,
    introText: r.intro_text,
    pdfPath: r.pdf_path,
    convertedInvoiceId: r.converted_invoice_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    acceptedAt: r.accepted_at,
    rejectedAt: r.rejected_at,
  };
}

function mapItem(r: OfferItemRow): OfferItem {
  return {
    id: r.id,
    offerId: r.offer_id,
    position: r.position,
    description: r.description,
    quantity: r.quantity,
    unit: r.unit,
    unitPrice: r.unit_price,
    vatRate: r.vat_rate,
    lineTotal: r.line_total,
  };
}

export type OfferItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
};

export type OfferFormInput = {
  customerId: number;
  issueDate: number;
  validUntil: number;
  notes: string | null;
  introText: string | null;
  isReverseCharge: boolean;
  items: OfferItemInput[];
};

export function computeLineTotal(item: OfferItemInput): number {
  return Math.round(item.quantity * item.unitPrice);
}

export function computeTotals(
  items: OfferItemInput[],
  opts: { isKleinunternehmer: boolean; isReverseCharge: boolean },
): { subtotal: number; vatAmount: number; total: number } {
  const vatExempt = opts.isKleinunternehmer || opts.isReverseCharge;
  let subtotal = 0;
  let vatAmount = 0;
  for (const item of items) {
    const line = computeLineTotal(item);
    subtotal += line;
    if (!vatExempt) {
      vatAmount += Math.round((line * item.vatRate) / 100);
    }
  }
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}

// --- List / get ---

export type OfferFilter = {
  status?: OfferStatus | "all";
  year?: number | "all";
  customerId?: number | "all";
  search?: string;
};

export type OfferListRow = Offer & { customerName: string };

export async function listOffers(
  filter: OfferFilter = {},
): Promise<OfferListRow[]> {
  const wheres: string[] = [];
  const binds: unknown[] = [];

  if (filter.status && filter.status !== "all") {
    wheres.push(`o.status = ?`);
    binds.push(filter.status);
  }
  if (filter.customerId && filter.customerId !== "all") {
    wheres.push(`o.customer_id = ?`);
    binds.push(filter.customerId);
  }
  if (filter.year && filter.year !== "all") {
    const start = Math.floor(new Date(filter.year, 0, 1).getTime() / 1000);
    const end = Math.floor(new Date(filter.year + 1, 0, 1).getTime() / 1000);
    wheres.push(`o.issue_date >= ? AND o.issue_date < ?`);
    binds.push(start, end);
  }
  if (filter.search && filter.search.trim() !== "") {
    wheres.push(`(o.number LIKE ? OR c.name LIKE ?)`);
    const q = `%${filter.search.trim()}%`;
    binds.push(q, q);
  }

  const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
  const rows = await select<OfferRow & { customer_name: string }>(
    `SELECT o.*, c.name AS customer_name
     FROM offers o
     LEFT JOIN customers c ON c.id = o.customer_id
     ${where}
     ORDER BY o.issue_date DESC, o.id DESC`,
    binds,
  );
  return rows.map((r) => ({
    ...mapOffer(r),
    customerName: r.customer_name ?? "—",
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

export async function getOfferYears(): Promise<number[]> {
  const rows = await select<{ y: number }>(
    "SELECT DISTINCT CAST(strftime('%Y', issue_date, 'unixepoch') AS INTEGER) AS y FROM offers ORDER BY y DESC",
  );
  return rows.map((r) => r.y).filter((y) => Number.isFinite(y));
}

// --- Numbering ---

async function nextOfferNumber(): Promise<string> {
  const db = await getDb();
  await db.execute(
    "UPDATE settings SET offer_number_counter = offer_number_counter + 1, updated_at = unixepoch() WHERE id = 1",
  );
  const rows = await db.select<
    Array<{ offer_number_counter: number; offer_number_format: string }>
  >("SELECT offer_number_counter, offer_number_format FROM settings WHERE id = 1");
  const counter = rows[0]?.offer_number_counter ?? 1;
  const pattern = rows[0]?.offer_number_format ?? "AN-{YYYY}-{NNNN}";
  return formatInvoiceNumber(pattern, counter);
}

// --- Mutations ---

async function buildCustomerSnapshot(
  customerId: number,
): Promise<CustomerSnapshot> {
  const c = await getCustomer(customerId);
  if (!c) throw new Error(`Customer ${customerId} not found`);
  return {
    customerNumber: c.customerNumber,
    name: c.name,
    contactPerson: c.contactPerson,
    street: c.street,
    postalCode: c.postalCode,
    city: c.city,
    country: c.country,
    email: c.email,
    vatId: c.vatId,
  };
}

async function writeItems(
  offerId: number,
  items: OfferItemInput[],
): Promise<void> {
  await execute("DELETE FROM offer_items WHERE offer_id = ?", [offerId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const line = computeLineTotal(it);
    await execute(
      `INSERT INTO offer_items
        (offer_id, position, description, quantity, unit, unit_price, vat_rate, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [offerId, i + 1, it.description, it.quantity, it.unit, it.unitPrice, it.vatRate, line],
    );
  }
}

export async function createOffer(input: OfferFormInput): Promise<number> {
  const settings = await loadSettings();
  const snapshot = await buildCustomerSnapshot(input.customerId);
  const totals = computeTotals(input.items, {
    isKleinunternehmer: settings.isKleinunternehmer,
    isReverseCharge: input.isReverseCharge,
  });
  const number = await nextOfferNumber();

  const res = await execute(
    `INSERT INTO offers
      (number, customer_id, customer_snapshot, issue_date, valid_until,
       status, subtotal, vat_amount, total, is_kleinunternehmer, is_reverse_charge,
       notes, intro_text)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
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
      input.isReverseCharge ? 1 : 0,
      input.notes,
      input.introText,
    ],
  );
  const id = Number(res.lastInsertId ?? 0);
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
  const totals = computeTotals(input.items, {
    isKleinunternehmer: existing.offer.isKleinunternehmer,
    isReverseCharge: input.isReverseCharge,
  });

  let snapshotJson = existing.offer.customerSnapshot;
  if (input.customerId !== existing.offer.customerId) {
    snapshotJson = JSON.stringify(await buildCustomerSnapshot(input.customerId));
  }

  await execute(
    `UPDATE offers SET
      customer_id = ?, customer_snapshot = ?,
      issue_date = ?, valid_until = ?,
      subtotal = ?, vat_amount = ?, total = ?,
      is_reverse_charge = ?,
      notes = ?, intro_text = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.customerId,
      snapshotJson,
      input.issueDate,
      input.validUntil,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      input.isReverseCharge ? 1 : 0,
      input.notes,
      input.introText,
      id,
    ],
  );
  await writeItems(id, input.items);
}

export async function deleteOffer(id: number): Promise<void> {
  const existing = await getOffer(id);
  if (!existing) return;
  if (existing.offer.status !== "draft" && existing.offer.status !== "rejected" && existing.offer.status !== "expired") {
    throw new Error("Nur Entwürfe, abgelehnte oder abgelaufene Angebote können gelöscht werden.");
  }
  await execute("DELETE FROM offers WHERE id = ?", [id]);
}

// --- Status transitions ---

export async function markSent(id: number): Promise<void> {
  await execute(
    "UPDATE offers SET status = 'sent', sent_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status = 'draft'",
    [id],
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

export async function markExpired(id: number): Promise<void> {
  await execute(
    "UPDATE offers SET status = 'expired', updated_at = unixepoch() WHERE id = ? AND status IN ('sent','draft')",
    [id],
  );
}

export async function reopenDraft(id: number): Promise<void> {
  await execute(
    "UPDATE offers SET status = 'draft', sent_at = NULL, accepted_at = NULL, rejected_at = NULL, updated_at = unixepoch() WHERE id = ? AND status IN ('sent','rejected','expired')",
    [id],
  );
}

/**
 * Auto-expire offers whose valid_until has passed.
 * Called on dashboard / list load — cheap, idempotent.
 */
export async function expireDueOffers(): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const res = await execute(
    "UPDATE offers SET status = 'expired', updated_at = unixepoch() WHERE status IN ('draft','sent') AND valid_until < ?",
    [now],
  );
  return res.rowsAffected ?? 0;
}

// --- Convert to invoice ---

/**
 * Creates a fresh draft invoice from this offer's data and links it back.
 * Returns the new invoice ID. The offer is marked as accepted.
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
  const issueDate = Math.floor(Date.now() / 1000);
  const dueDate = issueDate + paymentDays * 86400;

  const invoiceInput: InvoiceFormInput = {
    customerId: data.offer.customerId,
    issueDate,
    deliveryDate: null,
    dueDate,
    notes: data.offer.notes,
    paymentTerms: null,
    isReverseCharge: data.offer.isReverseCharge,
    items: data.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
    })),
  };

  const invoiceId = await createInvoice(invoiceInput);
  await execute(
    "UPDATE offers SET status = 'accepted', accepted_at = COALESCE(accepted_at, unixepoch()), converted_invoice_id = ?, updated_at = unixepoch() WHERE id = ?",
    [invoiceId, offerId],
  );
  return invoiceId;
}

// --- Dashboard ---

export async function openOffersStats(): Promise<{
  count: number;
  total: number;
  expiringSoonCount: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  const soon = now + 7 * 86400;
  const [open] = await select<{ c: number; t: number }>(
    "SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS t FROM offers WHERE status IN ('draft','sent')",
  );
  const [soonRow] = await select<{ c: number }>(
    "SELECT COUNT(*) AS c FROM offers WHERE status IN ('draft','sent') AND valid_until BETWEEN ? AND ?",
    [now, soon],
  );
  return {
    count: open?.c ?? 0,
    total: open?.t ?? 0,
    expiringSoonCount: soonRow?.c ?? 0,
  };
}
