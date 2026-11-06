/**
 * Test harness that runs the real migrations and the real SQL of the db layer on
 * node:sqlite. A test mocks "./client" with `sqliteClient(state)` (see seals.test.ts).
 */
// @ts-expect-error The project has no @types/node; node:sqlite is only used to run the real SQL in tests.
import { DatabaseSync } from "node:sqlite";

export type SqliteValue = string | number | null;

export type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...bindings: SqliteValue[]): unknown[];
    run(...bindings: SqliteValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  };
};

export type SqliteState = {
  current: SqliteDatabase | null;
  /** Runs before every write through the mocked client; may throw to make the write fail. */
  beforeExecute: ((query: string) => void) | null;
};

const MIGRATIONS = import.meta.glob<string>("./migrations/*.sql", { query: "?raw", import: "default", eager: true });

export function migratedDatabase(): SqliteDatabase {
  // Some migrations rebuild tables through sqlite_master, which node:sqlite's defensive mode forbids.
  const db = new DatabaseSync(":memory:", { defensive: false }) as SqliteDatabase;
  for (const path of Object.keys(MIGRATIONS).sort()) db.exec(MIGRATIONS[path]);
  return db;
}

export function sqliteClient(state: SqliteState) {
  const database = () => state.current!;
  const execute = async (query: string, bindings: SqliteValue[] = []) => {
    state.beforeExecute?.(query);
    const result = database().prepare(query).run(...bindings);
    return { rowsAffected: Number(result.changes), lastInsertId: Number(result.lastInsertRowid) };
  };
  return {
    select: async (query: string, bindings: SqliteValue[] = []) => database().prepare(query).all(...bindings),
    execute,
    insert: async (query: string, bindings: SqliteValue[] = []) => (await execute(query, bindings)).lastInsertId,
  };
}
