import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:zettel.db");
  }
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
export async function execute(query: string, bindings: unknown[] = []) {
  const db = await getDb();
  return db.execute(query, bindings);
}
