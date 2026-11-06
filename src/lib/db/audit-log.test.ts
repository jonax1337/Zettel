import { beforeEach, describe, expect, it } from "vitest";
import generatorSource from "../../../tools/gen_audit_triggers.py?raw";
import { migratedDatabase, type SqliteDatabase } from "./sqlite-test-db";

type AuditRow = {
  id: number;
  table_name: string;
  row_id: number;
  parent_id: number | null;
  action: string;
  old_values: string | null;
  new_values: string | null;
};

type Case = {
  table: string;
  insertSql: string;
  /** Column that holds the id of the invoice or expense the row belongs to. */
  parentColumn: string | null;
  changed: { column: string; value: string | number };
};

// The generator is the single list of audited tables and ignored columns.
const AUDITED_TABLES = [...generatorSource.match(/AUDITED_TABLES[^{]*\{([^}]*)\}/)![1].matchAll(/"(\w+)":/g)].map((m) => m[1]);
const IGNORED_COLUMNS = [...generatorSource.match(/IGNORED_COLUMNS = \{([^}]*)\}/)![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);

const CASES: Case[] = [
  {
    table: "customers",
    insertSql: "INSERT INTO customers (customer_number, name) VALUES ('K-0002', 'Beta')",
    parentColumn: null,
    changed: { column: "name", value: "Beta AG" },
  },
  {
    table: "vendors",
    insertSql: "INSERT INTO vendors (vendor_number, name) VALUES ('L-0002', 'Lieferant')",
    parentColumn: null,
    changed: { column: "name", value: "Lieferant AG" },
  },
  {
    table: "invoices",
    insertSql: "INSERT INTO invoices (number, customer_id, issue_date, due_date) VALUES ('RE-0002', 1, 100, 200)",
    parentColumn: null,
    changed: { column: "notes", value: "Hinweis" },
  },
  {
    table: "invoice_items",
    insertSql: "INSERT INTO invoice_items (invoice_id, position, description, quantity) VALUES (1, 1, 'Beratung', 1.5)",
    parentColumn: "invoice_id",
    changed: { column: "description", value: "Entwicklung" },
  },
  {
    table: "invoice_payments",
    insertSql: "INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent) VALUES (1, 100, 500)",
    parentColumn: "invoice_id",
    changed: { column: "amount_cent", value: 700 },
  },
  {
    table: "reminders",
    insertSql: "INSERT INTO reminders (number, invoice_id, issue_date, due_date) VALUES ('MA-0001', 1, 100, 200)",
    parentColumn: "invoice_id",
    changed: { column: "notes", value: "Telefonisch angekündigt" },
  },
  {
    table: "expenses",
    insertSql: "INSERT INTO expenses (internal_number, vendor_id, issue_date) VALUES ('EX-0002', 1, 100)",
    parentColumn: null,
    changed: { column: "notes", value: "Beleg liegt vor" },
  },
  {
    table: "expense_items",
    insertSql: "INSERT INTO expense_items (expense_id, position, description) VALUES (1, 1, 'Papier')",
    parentColumn: "expense_id",
    changed: { column: "description", value: "Toner" },
  },
  {
    table: "settings",
    insertSql: "INSERT INTO settings (id, company_name) VALUES (2, 'Zettel Test')",
    parentColumn: null,
    changed: { column: "company_name", value: "Zettel Test GmbH" },
  },
];

let db: SqliteDatabase;

function rows<T>(query: string, ...bindings: (string | number)[]): T[] {
  return db.prepare(query).all(...bindings) as T[];
}

function lastAuditId(): number {
  return rows<{ id: number | null }>("SELECT MAX(id) AS id FROM audit_log")[0].id ?? 0;
}

function auditRowsAfter(id: number): AuditRow[] {
  return rows<AuditRow>("SELECT * FROM audit_log WHERE id > ? ORDER BY id", id);
}

function columnsOf(table: string): string[] {
  return rows<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
}

/** The row as the triggers log it: every column except the ignored bookkeeping ones. */
function loggedRow(table: string, id: number): Record<string, unknown> {
  const row = rows<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = ?`, id)[0];
  return Object.fromEntries(Object.entries(row).filter(([column]) => !IGNORED_COLUMNS.includes(column)));
}

function insertedId(sql: string): number {
  return Number(db.prepare(sql).run().lastInsertRowid);
}

beforeEach(() => {
  db = migratedDatabase();
  db.exec(`
    INSERT INTO customers (id, customer_number, name) VALUES (1, 'K-0001', 'Acme GmbH');
    INSERT INTO vendors (id, vendor_number, name) VALUES (1, 'L-0001', 'Papier AG');
    INSERT INTO invoices (id, number, customer_id, issue_date, due_date) VALUES (1, 'RE-0001', 1, 100, 200);
    INSERT INTO expenses (id, internal_number, vendor_id, issue_date) VALUES (1, 'EX-0001', 1, 100);
  `);
});

describe("the audit triggers cover every column", () => {
  it("lists the tables and ignored columns the generator declares", () => {
    expect(AUDITED_TABLES).toHaveLength(CASES.length);
    expect(IGNORED_COLUMNS).toEqual(expect.arrayContaining(["updated_at"]));
  });

  describe.each(AUDITED_TABLES)("%s", (table) => {
    const triggerSql = (action: string) =>
      rows<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", `audit_${table}_${action}`)[0]?.sql ?? "";
    const loggedColumns = () => columnsOf(table).filter((column) => !IGNORED_COLUMNS.includes(column));

    it("reads every column of a new row in the insert trigger", () => {
      const missing = loggedColumns().filter((column) => !new RegExp(`\\bNEW\\.${column}\\b`).test(triggerSql("insert")));
      expect(missing).toEqual([]);
    });

    it("reads every column of a removed row in the delete trigger", () => {
      const missing = loggedColumns().filter((column) => !new RegExp(`\\bOLD\\.${column}\\b`).test(triggerSql("delete")));
      expect(missing).toEqual([]);
    });

    it("compares every column in the update trigger", () => {
      const missing = loggedColumns().filter(
        (column) => !new RegExp(`\\bOLD\\.${column}\\b`).test(triggerSql("update")) || !new RegExp(`\\bNEW\\.${column}\\b`).test(triggerSql("update")),
      );
      expect(missing).toEqual([]);
    });
  });
});

describe.each(CASES)("changes to $table", ({ table, insertSql, parentColumn, changed }) => {
  const parentOf = (id: number) =>
    parentColumn === null ? null : (rows<Record<string, number>>(`SELECT ${parentColumn} FROM ${table} WHERE id = ?`, id)[0][parentColumn]);

  it("logs an insert with the whole row", () => {
    const before = lastAuditId();

    const id = insertedId(insertSql);

    expect(auditRowsAfter(before)).toEqual([
      {
        id: expect.any(Number),
        changed_at: expect.any(Number),
        table_name: table,
        row_id: id,
        parent_id: parentOf(id),
        action: "insert",
        old_values: null,
        new_values: expect.any(String),
      },
    ]);
    expect(JSON.parse(auditRowsAfter(before)[0].new_values!)).toEqual(loggedRow(table, id));
  });

  it("logs an update with only the changed column", () => {
    const id = insertedId(insertSql);
    const oldValue = rows<Record<string, unknown>>(`SELECT ${changed.column} FROM ${table} WHERE id = ?`, id)[0][changed.column];
    const before = lastAuditId();

    db.prepare(`UPDATE ${table} SET ${changed.column} = ? WHERE id = ?`).run(changed.value, id);

    const [entry, ...rest] = auditRowsAfter(before);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ table_name: table, row_id: id, parent_id: parentOf(id), action: "update" });
    expect(JSON.parse(entry.old_values!)).toEqual({ [changed.column]: oldValue });
    expect(JSON.parse(entry.new_values!)).toEqual({ [changed.column]: changed.value });
  });

  it("logs nothing when only bookkeeping columns change", () => {
    const id = insertedId(insertSql);
    const bookkeeping = columnsOf(table).filter((column) => IGNORED_COLUMNS.includes(column));
    const before = lastAuditId();

    for (const column of bookkeeping) db.prepare(`UPDATE ${table} SET ${column} = 4242 WHERE id = ?`).run(id);

    expect(auditRowsAfter(before)).toEqual([]);
  });

  it("logs a delete with the whole row", () => {
    const id = insertedId(insertSql);
    const removed = loggedRow(table, id);
    const before = lastAuditId();

    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

    const [entry, ...rest] = auditRowsAfter(before);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({ table_name: table, row_id: id, parent_id: parentColumn ? removed[parentColumn] : null, action: "delete", new_values: null });
    expect(JSON.parse(entry.old_values!)).toEqual(removed);
  });
});

describe("the append-only tables", () => {
  const SEAL = "INSERT INTO invoice_seals (invoice_id, kind, sealed_at, content_hash, prev_hash, hash) VALUES (1, 'issue', 1, 'c', 'p', 'h')";

  it.each([
    ["UPDATE audit_log SET action = 'delete'"],
    ["DELETE FROM audit_log"],
    ["UPDATE invoice_seals SET hash = 'forged'"],
    ["DELETE FROM invoice_seals"],
  ])("rejects %s", (statement) => {
    db.exec("UPDATE customers SET name = 'Acme AG' WHERE id = 1");
    db.exec(SEAL);

    expect(() => db.exec(statement)).toThrow("unveränderlich");
  });

  it("keeps the rows after a rejected change", () => {
    db.exec(SEAL);
    const logged = rows<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log")[0].n;

    expect(() => db.exec("DELETE FROM audit_log")).toThrow();

    expect(rows<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log")[0].n).toBe(logged);
    expect(rows("SELECT * FROM invoice_seals")).toHaveLength(1);
  });
});

describe("the cost of the triggers", () => {
  const STATEMENTS = 2_000;
  const TIME_LIMIT_MS = 2_000;

  it("keeps 2000 payments with an invoice update each fast", () => {
    const addPayment = db.prepare("INSERT INTO invoice_payments (invoice_id, paid_at, amount_cent) VALUES (1, ?, 100)");
    const updateInvoice = db.prepare("UPDATE invoices SET amount_paid_cent = ? WHERE id = 1");
    const before = lastAuditId();

    const start = performance.now();
    for (let i = 1; i <= STATEMENTS; i++) {
      addPayment.run(i);
      updateInvoice.run(i * 100);
    }
    const elapsedMs = performance.now() - start;

    console.info(`audit triggers: ${STATEMENTS} payment inserts + ${STATEMENTS} invoice updates took ${elapsedMs.toFixed(0)} ms`);
    expect(auditRowsAfter(before)).toHaveLength(2 * STATEMENTS);
    expect(elapsedMs).toBeLessThan(TIME_LIMIT_MS);
  });
});
