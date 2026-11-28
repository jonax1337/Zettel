import { invoke } from "@tauri-apps/api/core";
import { formatDate } from "$lib/utils/date";

const KEY_PREFIX = "zettel.datev-last-export";

/** `context` identifies the open database (the active DB URL: sandbox or one tenant), so exports never cross over. */
export function lastExportKey(context: string): string {
  return `${KEY_PREFIX}:${context}`;
}

/** Unix seconds of the last successful export; null before the first one or when the stored value is unusable. */
export function loadLastExport(storage: Pick<Storage, "getItem">, context: string): number | null {
  try {
    const value = Number(storage.getItem(lastExportKey(context)));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastExport(storage: Pick<Storage, "setItem">, context: string, unixSeconds: number): void {
  try {
    storage.setItem(lastExportKey(context), String(unixSeconds));
  } catch {
    // Only a convenience for the overview; a blocked storage must not fail the export.
  }
}

export const lastExportLabel = (unixSeconds: number): string => `zuletzt exportiert am ${formatDate(unixSeconds)}`;

async function activeContext(): Promise<string | null> {
  try {
    return await invoke<string>("get_active_db_url");
  } catch {
    return null;
  }
}

export async function loadLastDatevExport(): Promise<number | null> {
  const context = await activeContext();
  return context === null ? null : loadLastExport(localStorage, context);
}

export async function rememberDatevExport(unixSeconds: number): Promise<void> {
  const context = await activeContext();
  if (context !== null) saveLastExport(localStorage, context, unixSeconds);
}
