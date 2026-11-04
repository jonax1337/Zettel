import { execute, insert, select } from "./client";
import { MISSING_NAME } from "./doc-queries";
import { getInvoice } from "./invoices";
import { drawNextNumber } from "./numbering";
import { loadSettings } from "./queries";
import type {
  CustomerSnapshot,
  Invoice,
  InvoiceStatus,
  Reminder,
  ReminderInvoiceSnapshot,
  ReminderLevel,
  ReminderStatus,
  Settings,
} from "./schema";
import { parseSnapshot } from "./snapshot-json";
import { addDaysUnix, nowUnix, SECONDS_PER_DAY } from "$lib/utils/date";

const DEFAULT_COUNTRY = "DE";
const REMINDER_LEVELS: readonly ReminderLevel[] = [1, 2, 3];
const REMINDABLE_STATUSES: readonly InvoiceStatus[] = ["sent", "partial"];

const LEVEL_LABELS: Record<ReminderLevel, string> = {
  1: "Zahlungserinnerung",
  2: "Mahnung",
  3: "Letzte Mahnung",
};

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
    const snapshot = parseSnapshot<ReminderInvoiceSnapshot>(r.invoice_snapshot, `Mahnungssnapshot ${r.number}`);
    return {
      ...mapReminder(r),
      invoiceNumber: snapshot.invoiceNumber ?? MISSING_NAME,
      customerName: snapshot.customerName ?? MISSING_NAME,
    };
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
  invoice: Pick<Invoice, "id" | "number" | "dueDate" | "total" | "amountPaidCent" | "currency">;
  customerName: string;
  daysOverdue: number;
  existingReminderLevels: ReminderLevel[];
};

type OverdueInvoiceRow = {
  id: number;
  number: string;
  due_date: number;
  total: number;
  amount_paid_cent: number;
  currency: string;
  customer_name: string | null;
};

function isReminderLevel(level: number): level is ReminderLevel {
  return (REMINDER_LEVELS as readonly number[]).includes(level);
}

async function loadReminderLevelsByInvoice(
  invoiceIds: number[],
): Promise<Map<number, ReminderLevel[]>> {
  const placeholders = invoiceIds.map(() => "?").join(",");
  const rows = await select<{ invoice_id: number; level: number }>(
    `SELECT invoice_id, level FROM reminders WHERE invoice_id IN (${placeholders})`,
    invoiceIds,
  );
  const levelsByInvoice = new Map<number, ReminderLevel[]>();
  for (const { invoice_id, level } of rows) {
    const levels = levelsByInvoice.get(invoice_id) ?? [];
    if (isReminderLevel(level)) levels.push(level);
    levelsByInvoice.set(invoice_id, levels);
  }
  return levelsByInvoice;
}

export async function listOverdueInvoices(): Promise<OverdueInvoice[]> {
  const now = nowUnix();
  const rows = await select<OverdueInvoiceRow>(
    `SELECT i.id, i.number, i.due_date, i.total, i.amount_paid_cent, i.currency, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.status IN ('sent','partial') AND i.due_date < ? AND (i.is_credit_note IS NULL OR i.is_credit_note = 0)
     ORDER BY i.due_date ASC`,
    [now],
  );
  if (!rows.length) return [];

  const levelsByInvoice = await loadReminderLevelsByInvoice(rows.map((r) => r.id));
  return rows.map((r) => ({
    invoice: {
      id: r.id,
      number: r.number,
      dueDate: r.due_date,
      total: r.total,
      amountPaidCent: r.amount_paid_cent,
      currency: r.currency,
    },
    customerName: r.customer_name ?? MISSING_NAME,
    daysOverdue: Math.max(0, Math.floor((now - r.due_date) / SECONDS_PER_DAY)),
    existingReminderLevels: levelsByInvoice.get(r.id) ?? [],
  }));
}

export function levelLabel(level: ReminderLevel): string {
  return LEVEL_LABELS[level];
}

function levelDefaults(
  settings: Settings,
  level: ReminderLevel,
): { feeCents: number; days: number; text: string } {
  switch (level) {
    case 1:
      return {
        feeCents: settings.reminderFeeL1Cents,
        days: settings.reminderDaysL1,
        text: settings.reminderTextL1,
      };
    case 2:
      return {
        feeCents: settings.reminderFeeL2Cents,
        days: settings.reminderDaysL2,
        text: settings.reminderTextL2,
      };
    case 3:
      return {
        feeCents: settings.reminderFeeL3Cents,
        days: settings.reminderDaysL3,
        text: settings.reminderTextL3,
      };
  }
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
  const defaults = levelDefaults(settings, level);
  const now = nowUnix();
  return {
    invoiceId,
    level,
    issueDate: now,
    dueDate: addDaysUnix(now, defaults.days),
    feeCents: defaults.feeCents,
    interestCents: 0,
    bodyText: defaults.text,
    notes: null,
  };
}

function buildInvoiceSnapshot(invoice: Invoice): ReminderInvoiceSnapshot {
  const customer = parseSnapshot<CustomerSnapshot>(invoice.customerSnapshot, `Kundensnapshot ${invoice.number}`);
  return {
    invoiceNumber: invoice.number,
    invoiceIssueDate: invoice.issueDate,
    invoiceDueDate: invoice.dueDate,
    customerName: customer.name ?? MISSING_NAME,
    customerStreet: customer.street ?? "",
    customerPostalCode: customer.postalCode ?? "",
    customerCity: customer.city ?? "",
    customerCountry: customer.country ?? DEFAULT_COUNTRY,
    customerContactPerson: customer.contactPerson ?? null,
  };
}

/** A reminder may only demand what is still open, so partial payments are deducted. */
export function remindableAmountCents(
  invoice: Pick<Invoice, "total" | "amountPaidCent">,
): number {
  return invoice.total - invoice.amountPaidCent;
}

function totalDueCents(
  r: Pick<Reminder, "originalTotalCents" | "feeCents" | "interestCents">,
): number {
  return r.originalTotalCents + r.feeCents + r.interestCents;
}

export async function createReminder(draft: ReminderDraft): Promise<number> {
  const data = await getInvoice(draft.invoiceId);
  if (!data) throw new Error(`Rechnung ${draft.invoiceId} nicht gefunden.`);
  if (!REMINDABLE_STATUSES.includes(data.invoice.status)) {
    throw new Error("Mahnungen können nur für versendete oder teilbezahlte Rechnungen erstellt werden.");
  }
  if (data.invoice.isCreditNote) {
    throw new Error("Für Stornorechnungen können keine Mahnungen erstellt werden.");
  }

  const number = await drawNextNumber("reminder", draft.issueDate);
  const snapshot = buildInvoiceSnapshot(data.invoice);
  const originalTotalCents = remindableAmountCents(data.invoice);

  return insert(
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
      originalTotalCents,
      totalDueCents({ originalTotalCents, ...draft }),
      draft.bodyText,
      draft.notes,
    ],
  );
}

/** The editable fields of a reminder, as set when it is created. */
export type ReminderFields = Omit<ReminderDraft, "invoiceId" | "level">;

export type ReminderPatch = Partial<ReminderFields>;

function applyPatch(existing: Reminder, patch: ReminderPatch): Reminder {
  return {
    ...existing,
    issueDate: patch.issueDate ?? existing.issueDate,
    dueDate: patch.dueDate ?? existing.dueDate,
    feeCents: patch.feeCents ?? existing.feeCents,
    interestCents: patch.interestCents ?? existing.interestCents,
    bodyText: patch.bodyText ?? existing.bodyText,
    notes: patch.notes === undefined ? existing.notes : patch.notes,
  };
}

export async function updateReminder(id: number, patch: ReminderPatch): Promise<void> {
  const existing = await getReminder(id);
  if (!existing) throw new Error(`Mahnung ${id} nicht gefunden.`);
  if (existing.status !== "draft") {
    throw new Error("Nur Entwürfe können bearbeitet werden.");
  }
  const next = applyPatch(existing, patch);
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
      totalDueCents(next),
      next.bodyText,
      next.notes,
      id,
    ],
  );
}

export async function markReminderSent(id: number, sentAt: number = nowUnix()): Promise<void> {
  await execute(
    "UPDATE reminders SET status = 'sent', sent_at = ?, updated_at = unixepoch() WHERE id = ? AND status = 'draft'",
    [sentAt, id],
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
