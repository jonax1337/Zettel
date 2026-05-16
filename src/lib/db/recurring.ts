import { execute, select } from "./client";
import { createInvoice } from "./invoices";
import type {
  InvoiceItem,
  RecurringInterval,
  RecurringInvoice,
  RecurringInvoiceItem,
} from "./schema";

// ----- Row types -----

type RecurringRow = {
  id: number;
  name: string;
  customer_id: number;
  interval: RecurringInterval;
  start_date: number;
  next_due_date: number;
  last_generated_at: number | null;
  payment_terms_days: number;
  is_reverse_charge: number;
  notes: string | null;
  payment_terms: string | null;
  active: number;
  created_at: number;
  updated_at: number;
};

type RecurringItemRow = {
  id: number;
  recurring_id: number;
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
};

function mapRecurring(r: RecurringRow): RecurringInvoice {
  return {
    id: r.id,
    name: r.name,
    customerId: r.customer_id,
    interval: r.interval,
    startDate: r.start_date,
    nextDueDate: r.next_due_date,
    lastGeneratedAt: r.last_generated_at,
    paymentTermsDays: r.payment_terms_days,
    isReverseCharge: r.is_reverse_charge === 1,
    notes: r.notes,
    paymentTerms: r.payment_terms,
    active: r.active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapRecurringItem(r: RecurringItemRow): RecurringInvoiceItem {
  return {
    id: r.id,
    recurringId: r.recurring_id,
    position: r.position,
    description: r.description,
    quantity: r.quantity,
    unit: r.unit,
    unitPrice: r.unit_price,
    vatRate: r.vat_rate,
  };
}

// ----- Date math -----

export function addInterval(unixSeconds: number, interval: RecurringInterval): number {
  const d = new Date(unixSeconds * 1000);
  switch (interval) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return Math.floor(d.getTime() / 1000);
}

// ----- Input shape -----

export type RecurringItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
};

export type RecurringFormInput = {
  name: string;
  customerId: number;
  interval: RecurringInterval;
  startDate: number;
  paymentTermsDays: number;
  isReverseCharge: boolean;
  notes: string | null;
  paymentTerms: string | null;
  active: boolean;
  items: RecurringItemInput[];
};

// ----- List / get -----

export type RecurringListRow = RecurringInvoice & { customerName: string };

export async function listRecurring(): Promise<RecurringListRow[]> {
  const rows = await select<RecurringRow & { customer_name: string }>(
    `SELECT r.*, c.name AS customer_name
     FROM recurring_invoices r
     LEFT JOIN customers c ON c.id = r.customer_id
     ORDER BY r.active DESC, r.next_due_date ASC, r.id ASC`,
  );
  return rows.map((r) => ({
    ...mapRecurring(r),
    customerName: r.customer_name ?? "—",
  }));
}

export async function getRecurring(
  id: number,
): Promise<{ recurring: RecurringInvoice; items: RecurringInvoiceItem[] } | null> {
  const rows = await select<RecurringRow>(
    "SELECT * FROM recurring_invoices WHERE id = ?",
    [id],
  );
  if (!rows.length) return null;
  const itemRows = await select<RecurringItemRow>(
    "SELECT * FROM recurring_invoice_items WHERE recurring_id = ? ORDER BY position ASC",
    [id],
  );
  return {
    recurring: mapRecurring(rows[0]),
    items: itemRows.map(mapRecurringItem),
  };
}

export async function dueRecurring(
  withinSeconds = 7 * 24 * 3600,
): Promise<RecurringListRow[]> {
  const threshold = Math.floor(Date.now() / 1000) + withinSeconds;
  const rows = await select<RecurringRow & { customer_name: string }>(
    `SELECT r.*, c.name AS customer_name
     FROM recurring_invoices r
     LEFT JOIN customers c ON c.id = r.customer_id
     WHERE r.active = 1 AND r.next_due_date <= ?
     ORDER BY r.next_due_date ASC, r.id ASC`,
    [threshold],
  );
  return rows.map((r) => ({
    ...mapRecurring(r),
    customerName: r.customer_name ?? "—",
  }));
}

// ----- Mutations -----

async function writeRecurringItems(
  recurringId: number,
  items: RecurringItemInput[],
): Promise<void> {
  await execute("DELETE FROM recurring_invoice_items WHERE recurring_id = ?", [
    recurringId,
  ]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await execute(
      `INSERT INTO recurring_invoice_items
        (recurring_id, position, description, quantity, unit, unit_price, vat_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [recurringId, i + 1, it.description, it.quantity, it.unit, it.unitPrice, it.vatRate],
    );
  }
}

export async function createRecurring(input: RecurringFormInput): Promise<number> {
  const res = await execute(
    `INSERT INTO recurring_invoices
      (name, customer_id, interval, start_date, next_due_date, payment_terms_days,
       is_reverse_charge, notes, payment_terms, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.customerId,
      input.interval,
      input.startDate,
      input.startDate,
      input.paymentTermsDays,
      input.isReverseCharge ? 1 : 0,
      input.notes,
      input.paymentTerms,
      input.active ? 1 : 0,
    ],
  );
  const id = Number(res.lastInsertId ?? 0);
  await writeRecurringItems(id, input.items);
  return id;
}

export async function updateRecurring(
  id: number,
  input: RecurringFormInput,
): Promise<void> {
  await execute(
    `UPDATE recurring_invoices SET
      name = ?, customer_id = ?, interval = ?, start_date = ?,
      payment_terms_days = ?, is_reverse_charge = ?,
      notes = ?, payment_terms = ?, active = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.name,
      input.customerId,
      input.interval,
      input.startDate,
      input.paymentTermsDays,
      input.isReverseCharge ? 1 : 0,
      input.notes,
      input.paymentTerms,
      input.active ? 1 : 0,
      id,
    ],
  );
  await writeRecurringItems(id, input.items);
}

export async function deleteRecurring(id: number): Promise<void> {
  await execute("DELETE FROM recurring_invoice_items WHERE recurring_id = ?", [id]);
  await execute("DELETE FROM recurring_invoices WHERE id = ?", [id]);
}

export async function toggleActive(id: number, active: boolean): Promise<void> {
  await execute(
    "UPDATE recurring_invoices SET active = ?, updated_at = unixepoch() WHERE id = ?",
    [active ? 1 : 0, id],
  );
}

/**
 * Create a draft invoice from the recurring template and bump the
 * template's next_due_date by one interval.
 *
 * The new invoice gets issue_date = today, due_date = today +
 * payment_terms_days. Customer snapshot is taken fresh at this point —
 * if the customer changed since the template was created, the new
 * invoice reflects the current customer state (rechtssicher zum
 * Rechnungszeitpunkt).
 */
export async function generateInvoiceFromRecurring(
  id: number,
): Promise<number> {
  const tmpl = await getRecurring(id);
  if (!tmpl) throw new Error(`Vorlage ${id} nicht gefunden.`);

  const now = Math.floor(Date.now() / 1000);
  const dueDate = now + tmpl.recurring.paymentTermsDays * 24 * 3600;

  const invoiceId = await createInvoice({
    customerId: tmpl.recurring.customerId,
    issueDate: now,
    deliveryDate: null,
    dueDate,
    notes: tmpl.recurring.notes,
    paymentTerms: tmpl.recurring.paymentTerms,
    isReverseCharge: tmpl.recurring.isReverseCharge,
    items: tmpl.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      vatRate: it.vatRate,
    })),
  });

  const nextDue = addInterval(tmpl.recurring.nextDueDate, tmpl.recurring.interval);
  await execute(
    `UPDATE recurring_invoices SET
      last_generated_at = ?, next_due_date = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [now, nextDue, id],
  );
  return invoiceId;
}

// ----- Snapshot helpers for the editor -----

/**
 * Best-effort: when the user wants "make a template out of this invoice",
 * we mirror its items into a fresh recurring template input shape.
 */
export function templateInputFromItems(
  items: Pick<InvoiceItem, "description" | "quantity" | "unit" | "unitPrice" | "vatRate">[],
): RecurringItemInput[] {
  return items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    vatRate: it.vatRate,
  }));
}
