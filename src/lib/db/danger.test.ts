import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { wipeAllBusinessData, wipeTables } from "./danger";

const database = (): SqliteDatabase => sqlite.current!;

const count = (table: string) =>
  (database().prepare(`SELECT COUNT(*) AS n FROM ${table}`).all()[0] as { n: number }).n;

beforeEach(() => {
  sqlite.current = migratedDatabase();
  sqlite.beforeExecute = null;
  database().exec(`
    PRAGMA foreign_keys = ON;
    INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH');
    INSERT INTO invoices (id, number, customer_id, issue_date, due_date, status) VALUES (1, 'DRAFT-1', 1, 1, 2, 'draft');
    INSERT INTO projects (id, customer_id, name) VALUES (1, 1, 'Website');
    INSERT INTO time_entries (project_id, entry_date, duration_minutes, invoice_id) VALUES (1, 1, 60, 1), (1, 2, 30, NULL);
  `);
});

describe("wiping time tracking data with its owners", () => {
  it("wiping the invoices leaves the time entries open, also without the foreign key action", async () => {
    database().exec("PRAGMA foreign_keys = OFF");

    await wipeTables(["invoices"]);

    expect(count("invoices")).toBe(0);
    expect(database().prepare("SELECT invoice_id FROM time_entries ORDER BY id").all()).toEqual([
      { invoice_id: null },
      { invoice_id: null },
    ]);
  });

  it("wiping the customers removes their projects and entries first", async () => {
    await wipeTables(["customers"]);

    expect([count("customers"), count("projects"), count("time_entries"), count("invoices")]).toEqual([0, 0, 0, 0]);
  });

  it("wiping everything removes projects and entries", async () => {
    await wipeAllBusinessData();

    expect([count("customers"), count("projects"), count("time_entries"), count("invoices")]).toEqual([0, 0, 0, 0]);
  });

  it("does not touch the time entries when only offers are wiped", async () => {
    await wipeTables(["offers"]);

    expect([count("projects"), count("time_entries")]).toEqual([1, 2]);
  });
});
