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

async function clearTable(name: WipeableTable): Promise<void> {
  // Reihenfolge wichtig: Children vor Parent, sonst FK-Constraint-Fail.
  switch (name) {
    case "invoices":
      await execute("DELETE FROM reminders");
      await execute("DELETE FROM invoice_items");
      await execute("DELETE FROM invoices");
      break;
    case "offers":
      await execute("DELETE FROM offer_items");
      await execute("DELETE FROM offers");
      break;
    case "expenses":
      await execute("DELETE FROM expense_items");
      await execute("DELETE FROM expenses");
      break;
    case "reminders":
      await execute("DELETE FROM reminders");
      break;
    case "customers":
      // Rechnungen+Angebote+Mahnungen hängen an customer_id — alle weg.
      await execute("DELETE FROM reminders");
      await execute("DELETE FROM invoice_items");
      await execute("DELETE FROM invoices");
      await execute("DELETE FROM offer_items");
      await execute("DELETE FROM offers");
      await execute("DELETE FROM recurring_invoice_items");
      await execute("DELETE FROM recurring_invoices");
      await execute("DELETE FROM customers");
      break;
    case "vendors":
      await execute("DELETE FROM expense_items");
      await execute("DELETE FROM expenses");
      await execute("DELETE FROM vendors");
      break;
    case "recurring_invoices":
      await execute("DELETE FROM recurring_invoice_items");
      await execute("DELETE FROM recurring_invoices");
      break;
    case "tax_prepayments":
      await execute("DELETE FROM tax_prepayments");
      break;
  }
}

export async function wipeTables(tables: WipeableTable[]): Promise<void> {
  for (const t of tables) await clearTable(t);
}

export async function wipeAllBusinessData(): Promise<void> {
  // Alle Geschäftsdaten — Settings bleiben.
  await execute("DELETE FROM reminders");
  await execute("DELETE FROM invoice_items");
  await execute("DELETE FROM invoices");
  await execute("DELETE FROM offer_items");
  await execute("DELETE FROM offers");
  await execute("DELETE FROM expense_items");
  await execute("DELETE FROM expenses");
  await execute("DELETE FROM recurring_invoice_items");
  await execute("DELETE FROM recurring_invoices");
  await execute("DELETE FROM tax_prepayments");
  await execute("DELETE FROM customers");
  await execute("DELETE FROM vendors");
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

/**
 * Macht ein unverschlüsseltes Backup nach `~/Documents/Zettel/Backups/pre-wipe-<ts>.zip`
 * und gibt den Pfad zurück. Wirft bei Fehler.
 */
export async function autoBackupBeforeWipe(
  dbSchemaVersion: number,
): Promise<string> {
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  let target: string;
  try {
    target = await invoke<string>("auto_backup_target", {
      filename: `pre-wipe-${ts}.zip`,
    });
  } catch (e) {
    throw new Error(`auto_backup_target: ${e}`);
  }

  let snapshotPath: string;
  try {
    snapshotPath = await invoke<string>("snapshot_db_path");
  } catch (e) {
    throw new Error(`snapshot_db_path: ${e}`);
  }

  try {
    await execute(`VACUUM INTO ?`, [snapshotPath]);
  } catch (e) {
    throw new Error(`VACUUM INTO '${snapshotPath}': ${e}`);
  }

  try {
    await invoke<string>("bundle_backup", {
      snapshotPath,
      targetZip: target,
      invoiceCount: null,
      dbSchemaVersion,
      password: null,
    });
  } catch (e) {
    throw new Error(`bundle_backup → '${target}': ${e}`);
  }
  return target;
}
