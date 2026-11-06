import { execute, insert, select } from "./client";
import { MISSING_NAME } from "./doc-queries";
import { getProject } from "./projects";
import type { InvoiceStatus, TimeEntry } from "./schema";
import { elapsedMinutes, resolveTiming, type TimeEntryTiming } from "$lib/time/entry-timing";
import { nowUnix, startOfDayUnix } from "$lib/utils/date";
import { displayInvoiceNumber } from "$lib/utils/invoice-number";

type TimeEntryRow = {
  id: number;
  project_id: number;
  entry_date: number;
  started_at: number | null;
  ended_at: number | null;
  duration_minutes: number | null;
  description: string;
  invoice_id: number | null;
  created_at: number;
  updated_at: number;
};

function mapTimeEntry(r: TimeEntryRow): TimeEntry {
  return {
    id: r.id,
    projectId: r.project_id,
    entryDate: r.entry_date,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMinutes: r.duration_minutes,
    description: r.description,
    invoiceId: r.invoice_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** An entry with the project, customer and invoice data the list shows next to it. */
export type TimeEntryListRow = TimeEntry & {
  projectName: string;
  hourlyRateCent: number;
  customerId: number;
  customerName: string;
  /** Display form, so a draft shows as "Entwurf #1a2b". Null while the entry is open. */
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus | null;
};

type TimeEntryListSqlRow = TimeEntryRow & {
  project_name: string;
  hourly_rate_cent: number;
  customer_id: number;
  customer_name: string | null;
  invoice_number: string | null;
  invoice_status: InvoiceStatus | null;
};

export type TimeEntryStatusFilter = "open" | "billed" | "all";

export type TimeEntryFilter = {
  /** Work days in [start, end), unix seconds. */
  period?: { start: number; end: number };
  customerId?: number | "all";
  projectId?: number | "all";
  /** `open` includes a running timer. Default `all`. */
  status?: TimeEntryStatusFilter;
};

export type TimeEntryInput = {
  projectId: number;
  /** Local midnight of the work day. */
  entryDate: number;
  description: string;
  timing: TimeEntryTiming;
};

const TIMER_ALREADY_RUNNING = "Es läuft bereits ein Timer. Bitte zuerst stoppen.";
const NO_TIMER_RUNNING = "Es läuft kein Timer.";
const BILLED_ENTRY = "Abgerechnete Einträge können nicht geändert oder gelöscht werden.";
const RUNNING_ENTRY = "Ein laufender Timer kann nicht bearbeitet werden. Bitte zuerst stoppen.";
const RUNNING_TIMER_CONDITION = "t.started_at IS NOT NULL AND t.ended_at IS NULL";

async function selectEntries(where: string, binds: unknown[]): Promise<TimeEntryListRow[]> {
  const rows = await select<TimeEntryListSqlRow>(
    `SELECT t.*, p.name AS project_name, p.hourly_rate_cent, p.customer_id,
            c.name AS customer_name, i.number AS invoice_number, i.status AS invoice_status
     FROM time_entries t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN customers c ON c.id = p.customer_id
     LEFT JOIN invoices i ON i.id = t.invoice_id
     ${where}
     ORDER BY t.entry_date DESC, COALESCE(t.started_at, 0) DESC, t.id DESC`,
    binds,
  );
  return rows.map((r) => ({
    ...mapTimeEntry(r),
    projectName: r.project_name,
    hourlyRateCent: r.hourly_rate_cent,
    customerId: r.customer_id,
    customerName: r.customer_name ?? MISSING_NAME,
    invoiceNumber:
      r.invoice_number === null || r.invoice_status === null
        ? null
        : displayInvoiceNumber({ number: r.invoice_number, status: r.invoice_status }),
    invoiceStatus: r.invoice_status,
  }));
}

export function listTimeEntries(filter: TimeEntryFilter = {}): Promise<TimeEntryListRow[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];
  if (filter.period) {
    conditions.push("t.entry_date >= ? AND t.entry_date < ?");
    binds.push(filter.period.start, filter.period.end);
  }
  if (filter.customerId && filter.customerId !== "all") {
    conditions.push("p.customer_id = ?");
    binds.push(filter.customerId);
  }
  if (filter.projectId && filter.projectId !== "all") {
    conditions.push("t.project_id = ?");
    binds.push(filter.projectId);
  }
  if (filter.status === "open") conditions.push("t.invoice_id IS NULL");
  if (filter.status === "billed") conditions.push("t.invoice_id IS NOT NULL");
  return selectEntries(conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", binds);
}

export function getTimeEntriesByIds(ids: number[]): Promise<TimeEntryListRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return selectEntries(`WHERE t.id IN (${ids.map(() => "?").join(", ")})`, ids);
}

async function getTimeEntry(id: number): Promise<TimeEntryListRow | null> {
  return (await getTimeEntriesByIds([id]))[0] ?? null;
}

/** The running timer, if any. At most one exists (unique index `uq_time_entries_running`). */
export async function getRunningTimer(): Promise<TimeEntryListRow | null> {
  return (await selectEntries(`WHERE ${RUNNING_TIMER_CONDITION}`, []))[0] ?? null;
}

async function assertProjectUsable(projectId: number): Promise<void> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Das Projekt wurde nicht gefunden.");
  if (project.archived) throw new Error("Das Projekt ist archiviert. Bitte ein aktives Projekt wählen.");
}

export async function createTimeEntry(input: TimeEntryInput): Promise<number> {
  const { startedAt, endedAt, durationMinutes } = resolveTiming(input.entryDate, input.timing);
  await assertProjectUsable(input.projectId);
  return insert(
    `INSERT INTO time_entries (project_id, entry_date, started_at, ended_at, duration_minutes, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.projectId, input.entryDate, startedAt, endedAt, durationMinutes, input.description.trim()],
  );
}

/** Only open, finished entries can be edited; a billed one is part of an invoice. */
export async function updateTimeEntry(id: number, input: TimeEntryInput): Promise<void> {
  const { startedAt, endedAt, durationMinutes } = resolveTiming(input.entryDate, input.timing);
  const current = await getTimeEntry(id);
  if (!current) throw new Error("Der Zeiteintrag wurde nicht gefunden.");
  if (current.invoiceId !== null) throw new Error(BILLED_ENTRY);
  if (current.durationMinutes === null) throw new Error(RUNNING_ENTRY);
  if (current.projectId !== input.projectId) await assertProjectUsable(input.projectId);

  const result = await execute(
    `UPDATE time_entries SET
       project_id = ?, entry_date = ?, started_at = ?, ended_at = ?, duration_minutes = ?,
       description = ?, updated_at = unixepoch()
     WHERE id = ? AND invoice_id IS NULL AND duration_minutes IS NOT NULL`,
    [input.projectId, input.entryDate, startedAt, endedAt, durationMinutes, input.description.trim(), id],
  );
  if (result.rowsAffected !== 1) throw new Error(BILLED_ENTRY);
}

/** Deletes an open entry (a running timer too); billed entries stay until their invoice draft is gone. */
export async function deleteTimeEntry(id: number): Promise<void> {
  const result = await execute("DELETE FROM time_entries WHERE id = ? AND invoice_id IS NULL", [id]);
  if (result.rowsAffected === 1) return;
  if (await getTimeEntry(id)) throw new Error(BILLED_ENTRY);
}

/**
 * Starts the timer on `projectId`. The entry belongs to the day it starts on,
 * also when the timer runs past midnight. The start time is stored, so the
 * timer keeps counting across an app restart.
 */
export async function startTimer(projectId: number, description: string): Promise<number> {
  await assertProjectUsable(projectId);
  const now = nowUnix();
  try {
    return await insert(
      "INSERT INTO time_entries (project_id, entry_date, started_at, description) VALUES (?, ?, ?, ?)",
      [projectId, startOfDayUnix(new Date(now * 1000)), now, description.trim()],
    );
  } catch (error) {
    if (String(error).includes("uq_time_entries_running")) throw new Error(TIMER_ALREADY_RUNNING);
    throw error;
  }
}

/** Ends the running timer; the duration is the elapsed time in whole minutes, at least one. */
export async function stopTimer(): Promise<TimeEntryListRow> {
  const running = await getRunningTimer();
  if (!running || running.startedAt === null) throw new Error(NO_TIMER_RUNNING);
  const endedAt = Math.max(nowUnix(), running.startedAt);
  const durationMinutes = elapsedMinutes(running.startedAt, endedAt);
  const result = await execute(
    `UPDATE time_entries SET ended_at = ?, duration_minutes = ?, updated_at = unixepoch()
     WHERE id = ? AND ended_at IS NULL`,
    [endedAt, durationMinutes, running.id],
  );
  if (result.rowsAffected !== 1) throw new Error(NO_TIMER_RUNNING);
  return { ...running, endedAt, durationMinutes };
}
