import { execute } from "./client";

export type WipeableTable =
  | "invoices"
  | "offers"
  | "expenses"
  | "reminders"
  | "customers"
  | "vendors"
  | "recurring_invoices"
  | "tax_prepayments";

export const WIPEABLE_TABLE_LABELS: Record<WipeableTable, string> = {
  invoices: "Rechnungen (inkl. Positionen)",
  offers: "Angebote (inkl. Positionen)",
  expenses: "Eingangsrechnungen (inkl. Positionen)",
  reminders: "Mahnungen",
  customers: "Kunden",
  vendors: "Lieferanten",
  recurring_invoices: "Wiederkehrende Rechnungen (Vorlagen)",
  tax_prepayments: "Steuer-Vorauszahlungen",
};

// audit_log and invoice_seals are deliberately absent: both are append-only
// (lock triggers abort deletes), and a deleted issued invoice is exactly what
// the integrity check must still report.
// Each list is ordered children before parent, otherwise FK constraints fail.
// invoice_payments has no FK to invoices, so it must be cleared explicitly.
const INVOICE_TABLES = ["reminders", "invoice_payments", "invoice_items", "invoices"];
const OFFER_TABLES = ["offer_items", "offers"];
const EXPENSE_TABLES = ["expense_items", "expenses"];
const RECURRING_TABLES = ["recurring_invoice_items", "recurring_invoices"];
const TIME_TABLES = ["time_entries", "projects"];

// Customers own invoices, offers, recurring templates and projects, so those go with them.
const TABLES_TO_CLEAR: Record<WipeableTable, string[]> = {
  invoices: INVOICE_TABLES,
  offers: OFFER_TABLES,
  expenses: EXPENSE_TABLES,
  reminders: ["reminders"],
  customers: [...INVOICE_TABLES, ...OFFER_TABLES, ...RECURRING_TABLES, ...TIME_TABLES, "customers"],
  vendors: [...EXPENSE_TABLES, "vendors"],
  recurring_invoices: RECURRING_TABLES,
  tax_prepayments: ["tax_prepayments"],
};

const ALL_BUSINESS_TABLES = [
  ...INVOICE_TABLES,
  ...OFFER_TABLES,
  ...EXPENSE_TABLES,
  ...RECURRING_TABLES,
  ...TIME_TABLES,
  "tax_prepayments",
  "customers",
  "vendors",
];

async function deleteAllRows(tables: string[]): Promise<void> {
  // Time entries survive a wipe of the invoices they were billed on, open again.
  if (tables.includes("invoices")) {
    await execute("UPDATE time_entries SET invoice_id = NULL WHERE invoice_id IS NOT NULL");
  }
  for (const table of tables) await execute(`DELETE FROM ${table}`);
}

export async function wipeTables(tables: WipeableTable[]): Promise<void> {
  for (const table of tables) await deleteAllRows(TABLES_TO_CLEAR[table]);
}

/** All business data; settings stay. */
export async function wipeAllBusinessData(): Promise<void> {
  await deleteAllRows(ALL_BUSINESS_TABLES);
}

export async function resetNumberingCounters(): Promise<void> {
  await execute(
    `UPDATE settings SET
       invoice_number_counter = 0,
       offer_number_counter = 0,
       expense_number_counter = 0,
       reminder_number_counter = 0,
       vendor_number_counter = 0,
       updated_at = unixepoch()
     WHERE id = 1`,
  );
}
