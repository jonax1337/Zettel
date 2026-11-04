import { invoke } from "@tauri-apps/api/core";
import { execute } from "$lib/db/client";
import { CURRENT_DB_SCHEMA_VERSION } from "./schema-version";

/** Snapshots the open database and bundles it with the PDFs into `targetZip`; `password` encrypts it. */
export async function writeBackupZip(targetZip: string, password: string | null): Promise<void> {
  const snapshotPath = await invoke<string>("snapshot_db_path");
  await execute(`VACUUM INTO ?`, [snapshotPath]);
  await invoke<string>("bundle_backup", {
    snapshotPath,
    targetZip,
    invoiceCount: null,
    dbSchemaVersion: CURRENT_DB_SCHEMA_VERSION,
    password,
  });
}

/** `2026-05-04_13-45-09` (UTC), sortable and valid in file names. */
export function backupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

/**
 * Unencrypted backup next to the auto-backups, taken before a change that
 * overwrites data. Returns its path.
 */
export async function writeSafetyBackup(prefix: string, date: Date = new Date()): Promise<string> {
  const target = await invoke<string>("auto_backup_target", {
    filename: `${prefix}-${backupTimestamp(date)}.zip`,
  });
  await writeBackupZip(target, null);
  return target;
}
