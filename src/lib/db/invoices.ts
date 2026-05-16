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
  notes: string | null;
  payment_terms: string | null;
  pdf_path: string | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
  paid_at: number | null;
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
    isReverseCharge: r.is_reverse_charge === 1,
    notes: r.notes,
    paymentTerms: r.payment_terms,
    pdfPath: r.pdf_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    paidAt: r.paid_at,
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

export type InvoiceFormInput = {
  customerId: number;
  issueDate: number;
  deliveryDate: number | null;
  dueDate: number;
  notes: string | null;
  paymentTerms: string | null;
  isReverseCharge: boolean;
  items: InvoiceItemInput[];
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

export async function createInvoice(input: InvoiceFormInput): Promise<number> {
  const settings = await loadSettings();
  const snapshot = await buildCustomerSnapshot(input.customerId);
  const totals = computeTotals(input.items, {
    isKleinunternehmer: settings.isKleinunternehmer,
    isReverseCharge: input.isReverseCharge,
  });
  const { number } = await nextInvoiceNumber();

  const res = await execute(
    `INSERT INTO invoices
      (number, customer_id, customer_snapshot, issue_date, delivery_date, due_date,
       status, subtotal, vat_amount, total, is_kleinunternehmer, is_reverse_charge,
       notes, payment_terms)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
    [
      number,
      input.customerId,
      JSON.stringify(snapshot),
      input.issueDate,
      input.deliveryDate,
      input.dueDate,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      settings.isKleinunternehmer ? 1 : 0,
      input.isReverseCharge ? 1 : 0,
      input.notes,
      input.paymentTerms,
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
  const totals = computeTotals(input.items, {
    isKleinunternehmer: existing.invoice.isKleinunternehmer,
    isReverseCharge: input.isReverseCharge,
  });

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
      is_reverse_charge = ?,
      notes = ?, payment_terms = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.customerId,
      snapshotJson,
      input.issueDate,
      input.deliveryDate,
      input.dueDate,
      totals.subtotal,
      totals.vatAmount,
      totals.total,
      input.isReverseCharge ? 1 : 0,
      input.notes,
      input.paymentTerms,
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

// --- Status transitions ---

export async function markSent(id: number): Promise<void> {
  await execute(
    "UPDATE invoices SET status = 'sent', sent_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status = 'draft'",
    [id],
  );
}

export async function markPaid(id: number): Promise<void> {
  await execute(
    "UPDATE invoices SET status = 'paid', paid_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status IN ('sent','draft')",
    [id],
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
