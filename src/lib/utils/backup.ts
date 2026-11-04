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
