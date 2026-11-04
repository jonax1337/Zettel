import { execute, insert, select } from "./client";
import { MISSING_NAME } from "./doc-queries";
import { createInvoice, type SupplyKind } from "./invoices";
import type {
  RecurringInterval,
  RecurringInvoice,
  RecurringInvoiceItem,
} from "./schema";
import { addDaysUnix, nowUnix } from "$lib/utils/date";

const DUE_SOON_DAYS = 7;

const MONTHS_PER_INTERVAL: Record<RecurringInterval, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

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
  supply_kind: string;
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
  long_description: string | null;
  line_period_start: number | null;
  line_period_end: number | null;
};

export function mapRecurring(r: RecurringRow): RecurringInvoice {
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
    supplyKind: r.supply_kind as RecurringInvoice["supplyKind"],
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
    longDescription: r.long_description,
    linePeriodStart: r.line_period_start,
    linePeriodEnd: r.line_period_end,
  };
}

// ----- Date math -----

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Advances by one interval, landing on `anchorDay` of the target month or on
 * its last day when the month is shorter (31 Jan + 1 month = 28/29 Feb, not 3 Mar).
 */
export function addInterval(
  unixSeconds: number,
  interval: RecurringInterval,
  anchorDay = new Date(unixSeconds * 1000).getDate(),
): number {
  const d = new Date(unixSeconds * 1000);
  d.setDate(1);
  d.setMonth(d.getMonth() + MONTHS_PER_INTERVAL[interval]);
  d.setDate(Math.min(anchorDay, daysInMonth(d.getFullYear(), d.getMonth())));
  return Math.floor(d.getTime() / 1000);
}

// ----- Input shape -----

export type RecurringItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  longDescription?: string | null;
  linePeriodStart?: number | null;
  linePeriodEnd?: number | null;
};

export type RecurringFormInput = {
  name: string;
  customerId: number;
  interval: RecurringInterval;
  startDate: number;
  paymentTermsDays: number;
  isReverseCharge: boolean;
  supplyKind: SupplyKind;
  notes: string | null;
  paymentTerms: string | null;
  active: boolean;
  items: RecurringItemInput[];
};

// ----- List / get -----

export type RecurringListRow = RecurringInvoice & { customerName: string };

type RecurringListQueryRow = RecurringRow & { customer_name: string | null };

async function selectRecurringRows(
  whereClause: string,
  ordering: string,
  binds: unknown[] = [],
): Promise<RecurringListRow[]> {
  const rows = await select<RecurringListQueryRow>(
    `SELECT r.*, c.name AS customer_name
     FROM recurring_invoices r
     LEFT JOIN customers c ON c.id = r.customer_id
     ${whereClause}
     ORDER BY ${ordering}`,
    binds,
  );
  return rows.map((r) => ({
    ...mapRecurring(r),
    customerName: r.customer_name ?? MISSING_NAME,
  }));
}

export function listRecurring(): Promise<RecurringListRow[]> {
  return selectRecurringRows("", "r.active DESC, r.next_due_date ASC, r.id ASC");
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

export function dueRecurring(): Promise<RecurringListRow[]> {
  const threshold = addDaysUnix(nowUnix(), DUE_SOON_DAYS);
  return selectRecurringRows(
    "WHERE r.active = 1 AND r.next_due_date <= ?",
    "r.next_due_date ASC, r.id ASC",
    [threshold],
  );
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
        (recurring_id, position, description, quantity, unit, unit_price, vat_rate,
         long_description, line_period_start, line_period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recurringId,
        i + 1,
        it.description,
        it.quantity,
        it.unit,
        it.unitPrice,
        it.vatRate,
        it.longDescription ?? null,
        it.linePeriodStart ?? null,
        it.linePeriodEnd ?? null,
      ],
    );
  }
}

export async function createRecurring(input: RecurringFormInput): Promise<number> {
  const id = await insert(
    `INSERT INTO recurring_invoices
      (name, customer_id, interval, start_date, next_due_date, payment_terms_days,
       is_reverse_charge, supply_kind, notes, payment_terms, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name,
      input.customerId,
      input.interval,
      input.startDate,
      input.startDate,
      input.paymentTermsDays,
      input.isReverseCharge ? 1 : 0,
      input.supplyKind,
      input.notes,
      input.paymentTerms,
      input.active ? 1 : 0,
    ],
  );
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
      payment_terms_days = ?, is_reverse_charge = ?, supply_kind = ?,
      notes = ?, payment_terms = ?, active = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.name,
      input.customerId,
      input.interval,
      input.startDate,
      input.paymentTermsDays,
      input.isReverseCharge ? 1 : 0,
      input.supplyKind,
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
  const { recurring } = tmpl;

  const now = nowUnix();
  const invoiceId = await createInvoice({
    customerId: recurring.customerId,
    issueDate: now,
    deliveryDate: null,
    dueDate: addDaysUnix(now, recurring.paymentTermsDays),
    notes: recurring.notes,
    paymentTerms: recurring.paymentTerms,
    reverseChargeType: recurring.isReverseCharge ? "intra_eu" : "none",
    supplyKind: recurring.supplyKind,
    items: tmpl.items.map(toItemInput),
  });

  const startDay = new Date(recurring.startDate * 1000).getDate();
  const nextDue = addInterval(recurring.nextDueDate, recurring.interval, startDay);
  await execute(
    `UPDATE recurring_invoices SET
      last_generated_at = ?, next_due_date = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [now, nextDue, id],
  );
  return invoiceId;
}

function toItemInput(it: RecurringInvoiceItem): RecurringItemInput {
  return {
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    vatRate: it.vatRate,
    longDescription: it.longDescription,
    linePeriodStart: it.linePeriodStart,
    linePeriodEnd: it.linePeriodEnd,
  };
}
