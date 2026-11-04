import { invoke } from "@tauri-apps/api/core";
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

// Each list is ordered children before parent, otherwise FK constraints fail.
// invoice_payments has no FK to invoices, so it must be cleared explicitly.
const INVOICE_TABLES = ["reminders", "invoice_payments", "invoice_items", "invoices"];
const OFFER_TABLES = ["offer_items", "offers"];
const EXPENSE_TABLES = ["expense_items", "expenses"];
const RECURRING_TABLES = ["recurring_invoice_items", "recurring_invoices"];

// Customers own invoices, offers and recurring templates, so those go with them.
const TABLES_TO_CLEAR: Record<WipeableTable, string[]> = {
  invoices: INVOICE_TABLES,
  offers: OFFER_TABLES,
  expenses: EXPENSE_TABLES,
  reminders: ["reminders"],
  customers: [...INVOICE_TABLES, ...OFFER_TABLES, ...RECURRING_TABLES, "customers"],
  vendors: [...EXPENSE_TABLES, "vendors"],
  recurring_invoices: RECURRING_TABLES,
  tax_prepayments: ["tax_prepayments"],
};

const ALL_BUSINESS_TABLES = [
  ...INVOICE_TABLES,
  ...OFFER_TABLES,
  ...EXPENSE_TABLES,
  ...RECURRING_TABLES,
  "tax_prepayments",
  "customers",
  "vendors",
];

async function deleteAllRows(tables: string[]): Promise<void> {
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

async function withContext<T>(step: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    throw new Error(`${step}: ${e}`);
  }
}

/** `2026-05-04_13-45-09` */
function backupTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
}

/**
 * Macht ein unverschlüsseltes Backup nach `~/Documents/Zettel/Backups/pre-wipe-<ts>.zip`
 * und gibt den Pfad zurück. Wirft bei Fehler.
 */
export async function autoBackupBeforeWipe(
  dbSchemaVersion: number,
): Promise<string> {
  const target = await withContext("auto_backup_target", () =>
    invoke<string>("auto_backup_target", {
      filename: `pre-wipe-${backupTimestamp()}.zip`,
    }),
  );
  const snapshotPath = await withContext("snapshot_db_path", () =>
    invoke<string>("snapshot_db_path"),
  );
  await withContext(`VACUUM INTO '${snapshotPath}'`, () =>
    execute("VACUUM INTO ?", [snapshotPath]),
  );
  await withContext(`bundle_backup → '${target}'`, () =>
    invoke<string>("bundle_backup", {
      snapshotPath,
      targetZip: target,
      invoiceCount: null,
      dbSchemaVersion,
      password: null,
    }),
  );
  return target;
}
