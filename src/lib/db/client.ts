import Database, { type QueryResult } from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

// Must match a migration registration in lib.rs byte-for-byte.
const PRODUCTION_DB_URL = "sqlite:zettel.db";
const SANDBOX_DB_URL = "sqlite:zettel-sandbox.db";

let dbPromise: Promise<Database> | null = null;
let sandboxPromise: Promise<boolean> | null = null;

export function isSandboxActive(): Promise<boolean> {
  sandboxPromise ??= invoke<boolean>("is_sandbox").catch(() => false);
  return sandboxPromise;
}

/** The active tenant's URL honors sandbox precedence; the sandbox flag is the fallback. */
async function resolveDbUrl(): Promise<string> {
  try {
    return await invoke<string>("get_active_db_url");
  } catch (e) {
    console.warn("get_active_db_url fehlgeschlagen, falle auf Sandbox-Flag zurück:", e);
    return (await isSandboxActive()) ? SANDBOX_DB_URL : PRODUCTION_DB_URL;
  }
}

export function getDb(): Promise<Database> {
  dbPromise ??= resolveDbUrl()
    .then((url) => Database.load(url))
    .catch((e) => {
      dbPromise = null;
      throw e;
    });
  return dbPromise;
}

/** Convenience: SELECT returning typed rows. */
export async function select<T>(
  query: string,
  bindings: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(query, bindings);
}

/** Convenience: INSERT/UPDATE/DELETE returning affected metadata. */
export async function execute(
  query: string,
  bindings: unknown[] = [],
): Promise<QueryResult> {
  const db = await getDb();
  return db.execute(query, bindings);
}

/** SQLite stores booleans as 0/1. */
export function toSqlBool(value: boolean | null | undefined): 0 | 1 {
  return value ? 1 : 0;
}

/** `%term%` for a LIKE match, or null when the term is blank. */
export function containsPattern(term: string): string | null {
  const trimmed = term.trim();
  return trimmed === "" ? null : `%${trimmed}%`;
}

/** Runs an INSERT and returns the new row id. */
export async function insert(
  query: string,
  bindings: unknown[] = [],
): Promise<number> {
  const { lastInsertId } = await execute(query, bindings);
  if (lastInsertId === undefined) {
    throw new Error("INSERT lieferte keine lastInsertId.");
  }
  return lastInsertId;
}
