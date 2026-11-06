/**
 * Read side of the GoBD audit log (#143). The triggers in migration 0029 fill
 * `audit_log`; insert/delete rows hold the whole row, update rows only the changed columns.
 */
import { select } from "./client";
import { CSV_LINE_BREAK, UTF8_BOM, escapeCsvField } from "$lib/utils/csv";
import { toIsoDate } from "$lib/utils/date";

export type AuditAction = "insert" | "update" | "delete" | "restore";

export type AuditValues = Record<string, unknown>;

export type AuditEntry = {
  id: number;
  changedAt: number;
  tableName: string;
  rowId: number;
  parentId: number | null;
  action: AuditAction;
  oldValues: AuditValues | null;
  newValues: AuditValues | null;
};

type AuditRow = {
  id: number;
  changed_at: number;
  table_name: string;
  row_id: number;
  parent_id: number | null;
  action: AuditAction;
  old_values: string | null;
  new_values: string | null;
};

const INVOICE_CHILD_TABLES = ["invoice_items", "invoice_payments", "reminders"];

function parseValues(json: string | null): AuditValues | null {
  return json === null ? null : (JSON.parse(json) as AuditValues);
}

function mapAuditRow(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    changedAt: row.changed_at,
    tableName: row.table_name,
    rowId: row.row_id,
    parentId: row.parent_id,
    action: row.action,
    oldValues: parseValues(row.old_values),
    newValues: parseValues(row.new_values),
  };
}

/** Changes of the invoice itself and of its items, payments and reminders, newest first. */
export async function listInvoiceHistory(invoiceId: number): Promise<AuditEntry[]> {
  const placeholders = INVOICE_CHILD_TABLES.map(() => "?").join(", ");
  const rows = await select<AuditRow>(
    `SELECT * FROM audit_log
     WHERE (table_name = 'invoices' AND row_id = ?)
        OR (table_name IN (${placeholders}) AND parent_id = ?)
     ORDER BY id DESC`,
    [invoiceId, ...INVOICE_CHILD_TABLES, invoiceId],
  );
  return rows.map(mapAuditRow);
}

export async function loadAuditLogForExport(): Promise<AuditEntry[]> {
  return (await select<AuditRow>("SELECT * FROM audit_log ORDER BY id")).map(mapAuditRow);
}

// --- CSV export ---

const CSV_HEADER = ["ID", "Zeitpunkt", "Tabelle", "Datensatz", "Beleg", "Aktion", "Alte Werte", "Neue Werte"];

function formatTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  return `${toIsoDate(unixSeconds)} ${time}`;
}

/** The invoice id a row belongs to, empty for tables without one. */
function invoiceIdOf(entry: AuditEntry): number | null {
  if (entry.tableName === "invoices") return entry.rowId;
  return INVOICE_CHILD_TABLES.includes(entry.tableName) ? entry.parentId : null;
}

function csvRow(entry: AuditEntry): string[] {
  return [
    String(entry.id),
    formatTimestamp(entry.changedAt),
    entry.tableName,
    String(entry.rowId),
    String(invoiceIdOf(entry) ?? ""),
    entry.action,
    entry.oldValues ? JSON.stringify(entry.oldValues) : "",
    entry.newValues ? JSON.stringify(entry.newValues) : "",
  ];
}

export function auditLogCsv(entries: AuditEntry[]): string {
  const lines = [CSV_HEADER, ...entries.map(csvRow)].map((fields) => fields.map(escapeCsvField).join(";"));
  return UTF8_BOM + lines.join(CSV_LINE_BREAK) + CSV_LINE_BREAK;
}
