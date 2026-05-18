import { execute, getDb, select } from "./client";
import { getCustomer, loadSettings } from "./queries";
import type {
  CustomerSnapshot,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
} from "./schema";
import { formatInvoiceNumber } from "$lib/utils/invoice-number";

// --- Row types (snake_case as returned from SQLite) ---

type InvoiceRow = {
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
};

type InvoiceItemRow = {
  id: number;
  invoice_id: number;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
};

function mapInvoice(r: InvoiceRow): Invoice {
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
    isReverseCharge: (r.reverse_charge_type ?? "none") !== "none",
    reverseChargeType: ((r.reverse_charge_type ?? "none") as Invoice["reverseChargeType"]),
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
    currency: r.currency ?? "EUR",
    exchangeRate: r.exchange_rate,
    eurTotalCent: r.eur_total_cent,
    notesInternal: r.notes_internal,
    followUpDate: r.follow_up_date,
  };
}

function mapItem(r: InvoiceItemRow): InvoiceItem {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    position: r.position,
    description: r.description,
    quantity: r.quantity,
    unit: r.unit,
    unitPrice: r.unit_price,
    vatRate: r.vat_rate,
    lineTotal: r.line_total,
  };
}

// --- Item input (no id/invoiceId/lineTotal — derived) ---

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // cents
  vatRate: number; // percent
};

export type ReverseChargeType = "none" | "intra_eu" | "third_country";

export type InvoiceFormInput = {
  customerId: number;
  issueDate: number;
  deliveryDate: number | null;
  dueDate: number;
  notes: string | null;
  paymentTerms: string | null;
  reverseChargeType: ReverseChargeType;
  isCreditNote?: boolean;
  correctsInvoiceId?: number | null;
  items: InvoiceItemInput[];
  currency?: string;
  exchangeRate?: string | null;
  eurTotalCent?: number | null;
  notesInternal?: string | null;
  followUpDate?: number | null;
};

// --- Totals ---

export function computeLineTotal(item: InvoiceItemInput): number {
  return Math.round(item.quantity * item.unitPrice);
}

export function computeTotals(
  items: InvoiceItemInput[],
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

export type InvoiceFilter = {
  status?: InvoiceStatus | "all";
  year?: number | "all";
  customerId?: number | "all";
  search?: string;
};

export type InvoiceListRow = Invoice & { customerName: string };

export async function listInvoices(
  filter: InvoiceFilter = {},
): Promise<InvoiceListRow[]> {
  const wheres: string[] = [];
  const binds: unknown[] = [];

  if (filter.status && filter.status !== "all") {
    wheres.push(`i.status = ?`);
    binds.push(filter.status);
  }
  if (filter.customerId && filter.customerId !== "all") {
    wheres.push(`i.customer_id = ?`);
    binds.push(filter.customerId);
  }
  if (filter.year && filter.year !== "all") {
    const start = Math.floor(new Date(filter.year, 0, 1).getTime() / 1000);
    const end = Math.floor(new Date(filter.year + 1, 0, 1).getTime() / 1000);
    wheres.push(`i.issue_date >= ? AND i.issue_date < ?`);
    binds.push(start, end);
  }
  if (filter.search && filter.search.trim() !== "") {
    wheres.push(`(i.number LIKE ? OR c.name LIKE ?)`);
    const q = `%${filter.search.trim()}%`;
    binds.push(q, q);
  }

  const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";
  const rows = await select<InvoiceRow & { customer_name: string }>(
    `SELECT i.*, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     ${where}
     ORDER BY i.issue_date DESC, i.id DESC`,
    binds,
  );
  return rows.map((r) => ({
    ...mapInvoice(r),
    customerName: r.customer_name ?? "—",
  }));
}

export async function getInvoice(
  id: number,
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  const rows = await select<InvoiceRow>(
    "SELECT * FROM invoices WHERE id = ?",
    [id],
  );
  if (!rows.length) return null;
  const itemRows = await select<InvoiceItemRow>(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position ASC",
    [id],
  );
  return { invoice: mapInvoice(rows[0]), items: itemRows.map(mapItem) };
}

export async function getInvoiceYears(): Promise<number[]> {
  const rows = await select<{ y: number }>(
    "SELECT DISTINCT CAST(strftime('%Y', issue_date, 'unixepoch') AS INTEGER) AS y FROM invoices ORDER BY y DESC",
  );
  return rows.map((r) => r.y).filter((y) => Number.isFinite(y));
}

// --- Numbering (atomic via tx) ---

async function nextInvoiceNumber(): Promise<{
  number: string;
  newCounter: number;
  pattern: string;
}> {
  const db = await getDb();
  // Bump counter atomically and read it back. Single-writer SQLite makes this safe.
  await db.execute(
    "UPDATE settings SET invoice_number_counter = invoice_number_counter + 1, updated_at = unixepoch() WHERE id = 1",
  );
  const rows = await db.select<
    Array<{ invoice_number_counter: number; invoice_number_format: string }>
  >("SELECT invoice_number_counter, invoice_number_format FROM settings WHERE id = 1");
  const counter = rows[0]?.invoice_number_counter ?? 1;
  const pattern = rows[0]?.invoice_number_format ?? "RE-{YYYY}-{NNNN}";
  return {
    number: formatInvoiceNumber(pattern, counter),
    newCounter: counter,
    pattern,
  };
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
  invoiceId: number,
  items: InvoiceItemInput[],
): Promise<void> {
  await execute("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const line = computeLineTotal(it);
    await execute(
      `INSERT INTO invoice_items
        (invoice_id, position, description, quantity, unit, unit_price, vat_rate, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, i + 1, it.description, it.quantity, it.unit, it.unitPrice, it.vatRate, line],
    );
  }
}

function draftPlaceholder(): string {
  // Random placeholder satisfies the UNIQUE constraint without burning a real
  // counter slot. Real number is assigned in issueInvoice() when the draft is
  // sent / PDF is generated. "DRAFT-" prefix never collides with RE-/AN-/MA-.
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `DRAFT-${rand}`;
}

export function isDraftNumber(n: string | null | undefined): boolean {
  return !!n && n.startsWith("DRAFT-");
}

export function displayInvoiceNumber(inv: {
  number: string;
  status: InvoiceStatus;
}): string {
  if (inv.status === "draft" && isDraftNumber(inv.number)) return "Entwurf";
  return inv.number;
}

export async function createInvoice(input: InvoiceFormInput): Promise<number> {
  const settings = await loadSettings();
  const snapshot = await buildCustomerSnapshot(input.customerId);
  const isReverseCharge = input.reverseChargeType !== "none";
  const totals = computeTotals(input.items, {
    isKleinunternehmer: settings.isKleinunternehmer,
    isReverseCharge,
  });
  const number = draftPlaceholder();

  const sign = input.isCreditNote ? -1 : 1;
  const res = await execute(
    `INSERT INTO invoices
      (number, customer_id, customer_snapshot, issue_date, delivery_date, due_date,
       status, subtotal, vat_amount, total, is_kleinunternehmer, is_reverse_charge,
       reverse_charge_type, notes, payment_terms, is_credit_note, corrects_invoice_id,
       currency, exchange_rate, eur_total_cent, notes_internal, follow_up_date)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      number,
      input.customerId,
      JSON.stringify(snapshot),
      input.issueDate,
      input.deliveryDate,
      input.dueDate,
      totals.subtotal * sign,
      totals.vatAmount * sign,
      totals.total * sign,
      settings.isKleinunternehmer ? 1 : 0,
      isReverseCharge ? 1 : 0,
      input.reverseChargeType,
      input.notes,
      input.paymentTerms,
      input.isCreditNote ? 1 : 0,
      input.correctsInvoiceId ?? null,
      input.currency ?? "EUR",
      input.exchangeRate ?? null,
      input.eurTotalCent ?? null,
      input.notesInternal ?? null,
      input.followUpDate ?? null,
    ],
  );
  const id = Number(res.lastInsertId ?? 0);
  await writeItems(id, input.items);
  return id;
}

export async function updateInvoice(
  id: number,
  input: InvoiceFormInput,
): Promise<void> {
  const existing = await getInvoice(id);
  if (!existing) throw new Error(`Invoice ${id} not found`);
  if (existing.invoice.status !== "draft") {
    throw new Error("Nur Entwürfe können bearbeitet werden.");
  }
  const isReverseCharge = input.reverseChargeType !== "none";
  const totals = computeTotals(input.items, {
    isKleinunternehmer: existing.invoice.isKleinunternehmer,
    isReverseCharge,
  });
  const sign = existing.invoice.isCreditNote ? -1 : 1;

  // If customer changed, refresh snapshot.
  let snapshotJson = existing.invoice.customerSnapshot;
  if (input.customerId !== existing.invoice.customerId) {
    snapshotJson = JSON.stringify(await buildCustomerSnapshot(input.customerId));
  }

  await execute(
    `UPDATE invoices SET
      customer_id = ?, customer_snapshot = ?,
      issue_date = ?, delivery_date = ?, due_date = ?,
      subtotal = ?, vat_amount = ?, total = ?,
      is_reverse_charge = ?, reverse_charge_type = ?,
      notes = ?, payment_terms = ?,
      currency = ?, exchange_rate = ?, eur_total_cent = ?,
      notes_internal = ?, follow_up_date = ?,
      updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.customerId,
      snapshotJson,
      input.issueDate,
      input.deliveryDate,
      input.dueDate,
      totals.subtotal * sign,
      totals.vatAmount * sign,
      totals.total * sign,
      isReverseCharge ? 1 : 0,
      input.reverseChargeType,
      input.notes,
      input.paymentTerms,
      input.currency ?? existing.invoice.currency ?? "EUR",
      input.exchangeRate ?? existing.invoice.exchangeRate ?? null,
      input.eurTotalCent ?? existing.invoice.eurTotalCent ?? null,
      input.notesInternal ?? existing.invoice.notesInternal ?? null,
      input.followUpDate ?? existing.invoice.followUpDate ?? null,
      id,
    ],
  );
  await writeItems(id, input.items);
}

export async function deleteInvoice(id: number): Promise<void> {
  const existing = await getInvoice(id);
  if (!existing) return;
  if (existing.invoice.status !== "draft" && existing.invoice.status !== "cancelled") {
    throw new Error("Nur Entwürfe oder stornierte Rechnungen können gelöscht werden.");
  }
  await execute("DELETE FROM invoices WHERE id = ?", [id]);
}

// --- Credit notes ---

export async function findCreditNoteFor(invoiceId: number): Promise<Invoice | null> {
  const rows = await select<InvoiceRow>(
    "SELECT * FROM invoices WHERE corrects_invoice_id = ? ORDER BY id ASC LIMIT 1",
    [invoiceId],
  );
  return rows.length ? mapInvoice(rows[0]) : null;
}

/**
 * Creates a draft credit note (Stornorechnung) from an existing sent/paid invoice.
 * Items are mirrored verbatim — user can edit quantities/positions in the draft to
 * model partial refunds before sending. Totals are stored negative.
 */
export async function createCreditNoteFromInvoice(originalId: number): Promise<number> {
  const data = await getInvoice(originalId);
  if (!data) throw new Error(`Rechnung ${originalId} nicht gefunden.`);
  const { invoice, items } = data;
  if (invoice.isCreditNote) {
    throw new Error("Für eine Stornorechnung kann keine weitere Stornorechnung erstellt werden.");
  }
  if (invoice.status !== "sent" && invoice.status !== "paid") {
    throw new Error("Nur versendete oder bezahlte Rechnungen können storniert werden.");
  }
  const existing = await findCreditNoteFor(originalId);
  if (existing) {
    throw new Error(`Es existiert bereits eine Stornorechnung (${existing.number}).`);
  }

  const issueDate = Math.floor(Date.now() / 1000);
  const input: InvoiceFormInput = {
    customerId: invoice.customerId,
    issueDate,
    deliveryDate: invoice.deliveryDate,
    dueDate: issueDate,
    notes: `Storno zur Rechnung ${invoice.number}`,
    paymentTerms: null,
    reverseChargeType: invoice.reverseChargeType,
    isCreditNote: true,
    correctsInvoiceId: originalId,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
    })),
  };
  return createInvoice(input);
}

// --- Status transitions ---

/**
 * Assigns the final invoice number (if still a DRAFT-… placeholder) and
 * transitions status draft → sent. Counter is only consumed here, never on
 * createInvoice — so deleted/abandoned drafts leave no gaps.
 *
 * sentAt is optional and defaults to "now". For nacherfassung of an old
 * invoice, pass the original send date as unix seconds.
 */
export async function issueInvoice(
  id: number,
  sentAt?: number,
): Promise<string> {
  const existing = await getInvoice(id);
  if (!existing) throw new Error(`Rechnung ${id} nicht gefunden.`);
  const cur = existing.invoice;
  if (cur.status !== "draft") {
    return cur.number;
  }
  const ts = sentAt ?? Math.floor(Date.now() / 1000);
  let finalNumber = cur.number;
  if (isDraftNumber(cur.number)) {
    const { number } = await nextInvoiceNumber();
    finalNumber = number;
  }
  await execute(
    `UPDATE invoices SET number = ?, status = 'sent', sent_at = ?, updated_at = unixepoch()
     WHERE id = ? AND status = 'draft'`,
    [finalNumber, ts, id],
  );
  return finalNumber;
}

export async function markSent(id: number, sentAt?: number): Promise<string> {
  return issueInvoice(id, sentAt);
}

export async function markPaid(id: number, paidAt?: number): Promise<void> {
  const existing = await getInvoice(id);
  if (!existing) return;
  // Drafts must be issued first so they get a real number.
  if (existing.invoice.status === "draft") {
    await issueInvoice(id, paidAt);
  }
  const ts = paidAt ?? Math.floor(Date.now() / 1000);
  await execute(
    `UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = unixepoch()
     WHERE id = ? AND status IN ('sent','draft')`,
    [ts, id],
  );
}

export async function cancelInvoice(id: number): Promise<void> {
  await execute(
    "UPDATE invoices SET status = 'cancelled', updated_at = unixepoch() WHERE id = ?",
    [id],
  );
}

export async function reopenDraft(id: number): Promise<void> {
  await execute(
    "UPDATE invoices SET status = 'draft', sent_at = NULL, paid_at = NULL, updated_at = unixepoch() WHERE id = ? AND status IN ('sent','cancelled')",
    [id],
  );
}

// --- Dashboard helpers ---

export async function dashboardStats(): Promise<{
  openCount: number;
  openTotal: number;
  paidYtdTotal: number;
  overdueCount: number;
  overdueTotal: number;
}> {
  const now = Math.floor(Date.now() / 1000);
  const yearStart = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);

  const [open] = await select<{ c: number; t: number }>(
    "SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS t FROM invoices WHERE status IN ('draft','sent')",
  );
  const [paid] = await select<{ t: number }>(
    "SELECT COALESCE(SUM(total), 0) AS t FROM invoices WHERE status = 'paid' AND paid_at >= ?",
    [yearStart],
  );
  const [overdue] = await select<{ c: number; t: number }>(
    "SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS t FROM invoices WHERE status = 'sent' AND due_date < ?",
    [now],
  );

  return {
    openCount: open?.c ?? 0,
    openTotal: open?.t ?? 0,
    paidYtdTotal: paid?.t ?? 0,
    overdueCount: overdue?.c ?? 0,
    overdueTotal: overdue?.t ?? 0,
  };
}

export type MonthlyRevenuePoint = {
  year: number;
  month: number; // 1-12
  label: string; // "Mai" / "2026-05"
  paidTotal: number; // cents (paid invoices only)
};

/**
 * Paid invoice totals grouped by month of paid_at, for the last N months
 * (including current). Months with no invoices are returned with 0 so the
 * chart's x-axis stays contiguous.
 */
export async function monthlyRevenue(months = 12): Promise<MonthlyRevenuePoint[]> {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startUnix = Math.floor(startDate.getTime() / 1000);

  const rows = await select<{ ym: string; t: number }>(
    `SELECT strftime('%Y-%m', paid_at, 'unixepoch') AS ym,
            COALESCE(SUM(total), 0) AS t
     FROM invoices
     WHERE status = 'paid' AND paid_at >= ?
     GROUP BY ym`,
    [startUnix],
  );

  const byKey = new Map(rows.map((r) => [r.ym, r.t]));
  const monthNames = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];
  const out: MonthlyRevenuePoint[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push({
      year: y,
      month: m,
      label: monthNames[d.getMonth()],
      paidTotal: byKey.get(key) ?? 0,
    });
  }
  return out;
}

export type TopCustomer = {
  customerId: number;
  name: string;
  customerNumber: string;
  invoiceCount: number;
  paidTotal: number; // cents
};

export async function topCustomers(limit = 5, months = 12): Promise<TopCustomer[]> {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const startUnix = Math.floor(startDate.getTime() / 1000);

  const rows = await select<{
    customer_id: number;
    name: string;
    customer_number: string;
    count: number;
    total: number;
  }>(
    `SELECT i.customer_id, c.name, c.customer_number,
            COUNT(*) AS count,
            COALESCE(SUM(i.total), 0) AS total
     FROM invoices i
     INNER JOIN customers c ON c.id = i.customer_id
     WHERE i.status = 'paid' AND i.paid_at >= ?
     GROUP BY i.customer_id
     ORDER BY total DESC
     LIMIT ?`,
    [startUnix, limit],
  );

  return rows.map((r) => ({
    customerId: r.customer_id,
    name: r.name,
    customerNumber: r.customer_number,
    invoiceCount: r.count,
    paidTotal: r.total,
  }));
}

export type InvoiceForExport = {
  invoice: Invoice;
  items: InvoiceItem[];
  customerName: string;
  customerVatId: string | null;
};

export async function loadInvoicesForExport(
  dateFromUnix: number,
  dateToUnix: number,
): Promise<InvoiceForExport[]> {
  const invRows = await select<InvoiceRow>(
    `SELECT * FROM invoices
     WHERE status IN ('sent','paid')
       AND issue_date >= ? AND issue_date <= ?
     ORDER BY issue_date ASC, id ASC`,
    [dateFromUnix, dateToUnix],
  );
  if (!invRows.length) return [];
  const ids = invRows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const itemRows = await select<InvoiceItemRow>(
    `SELECT * FROM invoice_items WHERE invoice_id IN (${placeholders}) ORDER BY invoice_id, position`,
    ids,
  );
  const itemsByInv = new Map<number, InvoiceItem[]>();
  for (const ir of itemRows) {
    const arr = itemsByInv.get(ir.invoice_id) ?? [];
    arr.push(mapItem(ir));
    itemsByInv.set(ir.invoice_id, arr);
  }
  return invRows.map((r) => {
    const invoice = mapInvoice(r);
    let customerName = "—";
    let customerVatId: string | null = null;
    try {
      const snap = JSON.parse(r.customer_snapshot) as CustomerSnapshot;
      customerName = snap.name ?? "—";
      customerVatId = snap.vatId ?? null;
    } catch {
      /* defaults */
    }
    return {
      invoice,
      items: itemsByInv.get(r.id) ?? [],
      customerName,
      customerVatId,
    };
  });
}

export async function recentInvoices(limit = 10): Promise<InvoiceListRow[]> {
  const rows = await select<InvoiceRow & { customer_name: string }>(
    `SELECT i.*, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     ORDER BY i.created_at DESC
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    ...mapInvoice(r),
    customerName: r.customer_name ?? "—",
  }));
}
