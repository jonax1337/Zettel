import { execute, getDb, select } from "./client";
import { getInvoice } from "./invoices";
import { loadSettings } from "./queries";
import type {
  CustomerSnapshot,
  Invoice,
  Reminder,
  ReminderInvoiceSnapshot,
  ReminderLevel,
  ReminderStatus,
  Settings,
} from "./schema";
import { formatInvoiceNumber } from "$lib/utils/invoice-number";

type ReminderRow = {
  id: number;
  number: string;
  invoice_id: number;
  invoice_snapshot: string;
  level: number;
  issue_date: number;
  due_date: number;
  fee_cents: number;
  interest_cents: number;
  original_total_cents: number;
  total_due_cents: number;
  status: ReminderStatus;
  body_text: string;
  pdf_path: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
};

function mapReminder(r: ReminderRow): Reminder {
  return {
    id: r.id,
    number: r.number,
    invoiceId: r.invoice_id,
    invoiceSnapshot: r.invoice_snapshot,
    level: r.level,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    feeCents: r.fee_cents,
    interestCents: r.interest_cents,
    originalTotalCents: r.original_total_cents,
    totalDueCents: r.total_due_cents,
    status: r.status,
    bodyText: r.body_text,
    pdfPath: r.pdf_path,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
  };
}

export type ReminderListRow = Reminder & {
  invoiceNumber: string;
  customerName: string;
};

export async function listReminders(): Promise<ReminderListRow[]> {
  const rows = await select<ReminderRow>(
    "SELECT * FROM reminders ORDER BY issue_date DESC, id DESC",
  );
  return rows.map((r) => {
    const reminder = mapReminder(r);
    let invoiceNumber = "—";
    let customerName = "—";
    try {
      const snap = JSON.parse(r.invoice_snapshot) as ReminderInvoiceSnapshot;
      invoiceNumber = snap.invoiceNumber ?? "—";
      customerName = snap.customerName ?? "—";
    } catch {
      /* defaults */
    }
    return { ...reminder, invoiceNumber, customerName };
  });
}

export async function getReminder(id: number): Promise<Reminder | null> {
  const rows = await select<ReminderRow>(
    "SELECT * FROM reminders WHERE id = ?",
    [id],
  );
  return rows.length ? mapReminder(rows[0]) : null;
}

export async function listRemindersForInvoice(
  invoiceId: number,
): Promise<Reminder[]> {
  const rows = await select<ReminderRow>(
    "SELECT * FROM reminders WHERE invoice_id = ? ORDER BY level ASC, id ASC",
    [invoiceId],
  );
  return rows.map(mapReminder);
}

export type OverdueInvoice = {
  invoice: Invoice;
  customerName: string;
  daysOverdue: number;
  existingReminderLevels: ReminderLevel[];
};

export async function listOverdueInvoices(): Promise<OverdueInvoice[]> {
  const now = Math.floor(Date.now() / 1000);
  const rows = await select<{
    id: number;
    number: string;
    customer_id: number;
    customer_snapshot: string;
    issue_date: number;
    delivery_date: number | null;
    due_date: number;
    status: Invoice["status"];
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
    currency: string | null;
    exchange_rate: string | null;
    eur_total_cent: number | null;
    notes_internal: string | null;
    follow_up_date: number | null;
    service_period_start: number | null;
    service_period_end: number | null;
    customer_name: string | null;
  }>(
    `SELECT i.*, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.status = 'sent' AND i.due_date < ? AND (i.is_credit_note IS NULL OR i.is_credit_note = 0)
     ORDER BY i.due_date ASC`,
    [now],
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const reminderRows = await select<{ invoice_id: number; level: number }>(
    `SELECT invoice_id, level FROM reminders WHERE invoice_id IN (${placeholders})`,
    ids,
  );
  const levelsByInv = new Map<number, ReminderLevel[]>();
  for (const rr of reminderRows) {
    const arr = levelsByInv.get(rr.invoice_id) ?? [];
    if (rr.level >= 1 && rr.level <= 3) {
      arr.push(rr.level as ReminderLevel);
    }
    levelsByInv.set(rr.invoice_id, arr);
  }

  return rows.map((r) => ({
    invoice: {
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
      lastValidationStatus: null,
      lastValidatedAt: null,
      lastValidationFindingsCount: null,
      currency: r.currency ?? "EUR",
      exchangeRate: r.exchange_rate,
      eurTotalCent: r.eur_total_cent,
      notesInternal: r.notes_internal,
      followUpDate: r.follow_up_date,
      servicePeriodStart: r.service_period_start,
      servicePeriodEnd: r.service_period_end,
    },
    customerName: r.customer_name ?? "—",
    daysOverdue: Math.max(0, Math.floor((now - r.due_date) / 86400)),
    existingReminderLevels: levelsByInv.get(r.id) ?? [],
  }));
}

function feeForLevel(settings: Settings, level: ReminderLevel): number {
  if (level === 1) return settings.reminderFeeL1Cents;
  if (level === 2) return settings.reminderFeeL2Cents;
  return settings.reminderFeeL3Cents;
}

function daysForLevel(settings: Settings, level: ReminderLevel): number {
  if (level === 1) return settings.reminderDaysL1;
  if (level === 2) return settings.reminderDaysL2;
  return settings.reminderDaysL3;
}

function textForLevel(settings: Settings, level: ReminderLevel): string {
  if (level === 1) return settings.reminderTextL1;
  if (level === 2) return settings.reminderTextL2;
  return settings.reminderTextL3;
}

export function levelLabel(level: ReminderLevel): string {
  if (level === 1) return "Zahlungserinnerung";
  if (level === 2) return "Mahnung";
  return "Letzte Mahnung";
}

export type ReminderDraft = {
  invoiceId: number;
  level: ReminderLevel;
  issueDate: number;
  dueDate: number;
  feeCents: number;
  interestCents: number;
  bodyText: string;
  notes: string | null;
};

export async function buildReminderDraft(
  invoiceId: number,
  level: ReminderLevel,
): Promise<ReminderDraft> {
  const data = await getInvoice(invoiceId);
  if (!data) throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  const settings = await loadSettings();
  const now = Math.floor(Date.now() / 1000);
  const days = daysForLevel(settings, level);
  return {
    invoiceId,
    level,
    issueDate: now,
    dueDate: now + days * 86400,
    feeCents: feeForLevel(settings, level),
    interestCents: 0,
    bodyText: textForLevel(settings, level),
    notes: null,
  };
}

async function nextReminderNumber(): Promise<string> {
  const db = await getDb();
  await db.execute(
    "UPDATE settings SET reminder_number_counter = reminder_number_counter + 1, updated_at = unixepoch() WHERE id = 1",
  );
  const rows = await db.select<
    Array<{ reminder_number_counter: number; reminder_number_format: string }>
  >("SELECT reminder_number_counter, reminder_number_format FROM settings WHERE id = 1");
  const counter = rows[0]?.reminder_number_counter ?? 1;
  const pattern = rows[0]?.reminder_number_format ?? "MA-{YYYY}-{NNNN}";
  return formatInvoiceNumber(pattern, counter);
}

function buildInvoiceSnapshot(invoice: Invoice): ReminderInvoiceSnapshot {
  let customerName = "—";
  let street = "";
  let postalCode = "";
  let city = "";
  let country = "DE";
  let contact: string | null = null;
  try {
    const snap = JSON.parse(invoice.customerSnapshot) as CustomerSnapshot;
    customerName = snap.name ?? "—";
    street = snap.street ?? "";
    postalCode = snap.postalCode ?? "";
    city = snap.city ?? "";
    country = snap.country ?? "DE";
    contact = snap.contactPerson ?? null;
  } catch {
    /* defaults */
  }
  return {
    invoiceNumber: invoice.number,
    invoiceIssueDate: invoice.issueDate,
    invoiceDueDate: invoice.dueDate,
    customerName,
    customerStreet: street,
    customerPostalCode: postalCode,
    customerCity: city,
    customerCountry: country,
    customerContactPerson: contact,
  };
}

export async function createReminder(draft: ReminderDraft): Promise<number> {
  const data = await getInvoice(draft.invoiceId);
  if (!data) throw new Error(`Rechnung ${draft.invoiceId} nicht gefunden.`);
  if (data.invoice.status !== "sent") {
    throw new Error("Mahnungen können nur für versendete Rechnungen erstellt werden.");
  }
  if (data.invoice.isCreditNote) {
    throw new Error("Für Stornorechnungen können keine Mahnungen erstellt werden.");
  }

  const number = await nextReminderNumber();
  const snapshot = buildInvoiceSnapshot(data.invoice);
  const originalTotal = data.invoice.total;
  const totalDue = originalTotal + draft.feeCents + draft.interestCents;

  const res = await execute(
    `INSERT INTO reminders
      (number, invoice_id, invoice_snapshot, level, issue_date, due_date,
       fee_cents, interest_cents, original_total_cents, total_due_cents,
       status, body_text, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    [
      number,
      draft.invoiceId,
      JSON.stringify(snapshot),
      draft.level,
      draft.issueDate,
      draft.dueDate,
      draft.feeCents,
      draft.interestCents,
      originalTotal,
      totalDue,
      draft.bodyText,
      draft.notes,
    ],
  );
  return Number(res.lastInsertId ?? 0);
}

export async function updateReminder(
  id: number,
  patch: Partial<Pick<Reminder, "issueDate" | "dueDate" | "feeCents" | "interestCents" | "bodyText" | "notes">>,
): Promise<void> {
  const existing = await getReminder(id);
  if (!existing) throw new Error(`Mahnung ${id} nicht gefunden.`);
  if (existing.status !== "draft") {
    throw new Error("Nur Entwürfe können bearbeitet werden.");
  }
  const next: Reminder = {
    ...existing,
    issueDate: patch.issueDate ?? existing.issueDate,
    dueDate: patch.dueDate ?? existing.dueDate,
    feeCents: patch.feeCents ?? existing.feeCents,
    interestCents: patch.interestCents ?? existing.interestCents,
    bodyText: patch.bodyText ?? existing.bodyText,
    notes: patch.notes ?? existing.notes,
  };
  const totalDue = next.originalTotalCents + next.feeCents + next.interestCents;
  await execute(
    `UPDATE reminders SET
       issue_date = ?, due_date = ?, fee_cents = ?, interest_cents = ?,
       total_due_cents = ?, body_text = ?, notes = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      next.issueDate,
      next.dueDate,
      next.feeCents,
      next.interestCents,
      totalDue,
      next.bodyText,
      next.notes,
      id,
    ],
  );
}

export async function markReminderSent(id: number): Promise<void> {
  await execute(
    "UPDATE reminders SET status = 'sent', sent_at = unixepoch(), updated_at = unixepoch() WHERE id = ? AND status = 'draft'",
    [id],
  );
}

export async function deleteReminder(id: number): Promise<void> {
  const existing = await getReminder(id);
  if (!existing) return;
  if (existing.status !== "draft") {
    throw new Error("Nur Entwürfe können gelöscht werden.");
  }
  await execute("DELETE FROM reminders WHERE id = ?", [id]);
}

export async function dashboardOverdueCount(): Promise<{ count: number; total: number }> {
  const now = Math.floor(Date.now() / 1000);
  const [row] = await select<{ c: number; t: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS t
     FROM invoices
     WHERE status = 'sent' AND due_date < ? AND (is_credit_note IS NULL OR is_credit_note = 0)`,
    [now],
  );
  return { count: row?.c ?? 0, total: row?.t ?? 0 };
}
