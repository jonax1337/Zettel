import type { CustomerSnapshot } from "$lib/db/schema";

export const UNREADABLE_SNAPSHOT_MESSAGE = "Die Kundendaten dieses Dokuments konnten nicht gelesen werden.";

/** Returns null when the stored snapshot is not valid JSON. */
export function parseCustomerSnapshot(json: string): CustomerSnapshot | null {
  try {
    return JSON.parse(json) as CustomerSnapshot;
  } catch {
    return null;
  }
}
