/** German text for the entries of an invoice's change history (`audit_log`). */
import type { AuditEntry, AuditValues } from "$lib/db/audit";
import { formatMoney } from "$lib/utils/currency";
import { formatDate } from "$lib/utils/date";
import { displayInvoiceNumber } from "$lib/utils/invoice-number";
import { INVOICE_STATUS_LABEL } from "./status";

type ValueKind = "text" | "money" | "eur" | "date" | "status" | "number" | "validation" | "event";

const VALIDATION_LABEL: Record<string, string> = {
  valid: "gültig",
  invalid: "ungültig",
  unavailable: "nicht geprüft",
};

/** `event` columns read as a phrase on their own; their old and new value are not shown. */
type ColumnSpec = { label: string; kind: ValueKind };

const text = (label: string): ColumnSpec => ({ label, kind: "text" });
const money = (label: string): ColumnSpec => ({ label, kind: "money" });
const eur = (label: string): ColumnSpec => ({ label, kind: "eur" });
const date = (label: string): ColumnSpec => ({ label, kind: "date" });
const event = (label: string): ColumnSpec => ({ label, kind: "event" });

const INVOICE_COLUMNS: Record<string, ColumnSpec> = {
  number: { label: "Nummer", kind: "number" },
  customer_id: text("Kunde"),
  customer_snapshot: event("Kundendaten eingefroren"),
  issue_date: date("Rechnungsdatum"),
  delivery_date: date("Lieferdatum"),
  due_date: date("Fälligkeit"),
  status: { label: "Status", kind: "status" },
  subtotal: money("Netto"),
  vat_amount: money("USt"),
  total: money("Gesamt"),
  notes: event("Notizen geändert"),
  payment_terms: event("Zahlungsbedingungen geändert"),
  notes_internal: event("Interne Notizen geändert"),
  pdf_path: event("PDF erzeugt"),
  sent_at: date("Versendet am"),
  paid_at: date("Bezahlt am"),
  amount_paid_cent: money("Bezahlt"),
  eur_total_cent: eur("Gesamt (EUR)"),
  follow_up_date: date("Wiedervorlage"),
  currency: text("Währung"),
  exchange_rate: text("Wechselkurs"),
  service_period_start: date("Leistungszeitraum von"),
  service_period_end: date("Leistungszeitraum bis"),
  skonto_percent: text("Skonto (%)"),
  skonto_days: text("Skonto (Tage)"),
  buyer_reference: text("Leitweg-ID"),
  corrects_invoice_id: text("Korrigiert Rechnung"),
  is_credit_note: text("Stornorechnung"),
  is_reverse_charge: text("Reverse-Charge"),
  reverse_charge_type: text("Reverse-Charge-Art"),
  is_kleinunternehmer: text("Kleinunternehmer"),
  last_validation_status: { label: "Validierungsstatus", kind: "validation" },
  last_validated_at: date("Validiert am"),
  last_validation_findings_count: text("Validierungsbefunde"),
};

const ITEM_COLUMNS: Record<string, ColumnSpec> = {
  position: text("Reihenfolge"),
  description: text("Beschreibung"),
  quantity: text("Menge"),
  unit: text("Einheit"),
  unit_price: money("Einzelpreis"),
  vat_rate: text("USt-Satz"),
  line_total: money("Summe"),
  long_description: event("Langtext geändert"),
  line_period_start: date("Zeitraum von"),
  line_period_end: date("Zeitraum bis"),
};

const PAYMENT_COLUMNS: Record<string, ColumnSpec> = {
  paid_at: date("Datum"),
  amount_cent: money("Betrag"),
  eur_amount_cent: eur("Betrag (EUR)"),
  source: text("Quelle"),
  notes: event("Notiz geändert"),
};

const REMINDER_COLUMNS: Record<string, ColumnSpec> = {
  number: text("Nummer"),
  level: text("Stufe"),
  issue_date: date("Datum"),
  due_date: date("Zahlungsfrist"),
  fee_cents: money("Gebühr"),
  interest_cents: money("Zinsen"),
};

type TableSpec = {
  columns: Record<string, ColumnSpec>;
  /** Appended after the verb, e.g. "Position hinzugefügt: Beratung". */
  subject: (values: AuditValues, currency: string) => string;
  inserted: string;
  updated: string;
  deleted: string;
};

const EMPTY_VALUE = "–";
const EUR = "EUR";

function formatValue(spec: ColumnSpec, value: unknown, currency: string): string {
  if (value === null || value === undefined) return EMPTY_VALUE;
  switch (spec.kind) {
    case "money":
      return formatMoney(Number(value), currency);
    case "eur":
      return formatMoney(Number(value), EUR);
    case "date":
      return formatDate(Number(value));
    case "status":
      return INVOICE_STATUS_LABEL[value as keyof typeof INVOICE_STATUS_LABEL] ?? String(value);
    case "number":
      return displayInvoiceNumber({ number: String(value), status: "draft" });
    case "validation":
      return VALIDATION_LABEL[String(value)] ?? String(value);
    default:
      return String(value);
  }
}

const TABLES: Record<string, TableSpec> = {
  invoices: {
    columns: INVOICE_COLUMNS,
    subject: () => "",
    inserted: "Rechnung angelegt",
    updated: "Rechnung geändert",
    deleted: "Rechnung gelöscht",
  },
  invoice_items: {
    columns: ITEM_COLUMNS,
    subject: (values) => (values.description ? String(values.description) : ""),
    inserted: "Position hinzugefügt",
    updated: "Position geändert",
    deleted: "Position entfernt",
  },
  invoice_payments: {
    columns: PAYMENT_COLUMNS,
    subject: (values, currency) =>
      values.amount_cent === undefined ? "" : formatMoney(Number(values.amount_cent), currency),
    inserted: "Zahlung erfasst",
    updated: "Zahlung geändert",
    deleted: "Zahlung gelöscht",
  },
  reminders: {
    columns: REMINDER_COLUMNS,
    subject: (values) => (values.level === undefined ? "" : `Stufe ${values.level}`),
    inserted: "Mahnung angelegt",
    updated: "Mahnung geändert",
    deleted: "Mahnung gelöscht",
  },
};

function describeChanges(table: TableSpec, entry: AuditEntry, currency: string): string {
  const oldValues = entry.oldValues ?? {};
  return Object.entries(entry.newValues ?? {})
    .map(([column, newValue]) => {
      const spec = table.columns[column] ?? text(column);
      if (spec.kind === "event") return spec.label;
      const before = formatValue(spec, oldValues[column], currency);
      const after = formatValue(spec, newValue, currency);
      // A date re-saved at another time of day reads the same; showing "4.11. → 4.11." only confuses.
      return before === after ? null : `${spec.label} ${before} → ${after}`;
    })
    .filter((change) => change !== null)
    .join(", ");
}

function withDetail(headline: string, detail: string): string {
  return detail ? `${headline}: ${detail}` : headline;
}

/** Amounts are in the invoice's currency unless the entry itself records a currency change. */
export function describeAuditEntry(entry: AuditEntry, invoiceCurrency: string): string {
  if (entry.action === "restore") return "Teilwiederherstellung aus Backup";
  const table = TABLES[entry.tableName];
  if (!table) return `${entry.tableName}: ${entry.action}`;

  const values = (entry.action === "delete" ? entry.oldValues : entry.newValues) ?? {};
  const currency = typeof values.currency === "string" ? values.currency : invoiceCurrency;
  switch (entry.action) {
    case "insert":
      return withDetail(table.inserted, table.subject(values, currency));
    case "delete":
      return withDetail(table.deleted, table.subject(values, currency));
    case "update":
      return withDetail(table.updated, describeChanges(table, entry, currency));
  }
}

