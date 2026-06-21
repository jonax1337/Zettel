import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let dbPromise: Promise<Database> | null = null;
let sandboxCache: boolean | null = null;

async function resolveSandbox(): Promise<boolean> {
  if (sandboxCache !== null) return sandboxCache;
  try {
    sandboxCache = await invoke<boolean>("is_sandbox");
  } catch {
    sandboxCache = false;
  }
  return sandboxCache;
}

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // Active DB URL honors sandbox precedence + the selected tenant. The
      // string must match a migration registration in lib.rs byte-for-byte.
      let url = "sqlite:zettel.db";
      try {
        url = await invoke<string>("get_active_db_url");
      } catch {
        const sandbox = await resolveSandbox();
        url = sandbox ? "sqlite:zettel-sandbox.db" : "sqlite:zettel.db";
      }
      return Database.load(url);
    })();
  }
  return dbPromise;
}

export async function isSandboxActive(): Promise<boolean> {
  return resolveSandbox();
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
export async function execute(query: string, bindings: unknown[] = []) {
  const db = await getDb();
  return db.execute(query, bindings);
}
