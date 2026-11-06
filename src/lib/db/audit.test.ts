import { describe, expect, it } from "vitest";
import { UTF8_BOM } from "$lib/utils/csv";
import { auditLogCsv, type AuditEntry } from "./audit";

const CHANGED_AT = Math.floor(new Date(2026, 4, 22, 14, 30, 5).getTime() / 1000);

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    id: 1,
    changedAt: CHANGED_AT,
    tableName: "invoices",
    rowId: 7,
    parentId: null,
    action: "insert",
    oldValues: null,
    newValues: null,
    ...overrides,
  };
}

describe("auditLogCsv", () => {
  it("starts with a BOM and the header line", () => {
    const csv = auditLogCsv([]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv.slice(UTF8_BOM.length)).toBe(
      "ID;Zeitpunkt;Tabelle;Datensatz;Beleg;Aktion;Alte Werte;Neue Werte\r\n",
    );
  });

  it("writes local timestamps and the invoice a child row belongs to", () => {
    const csv = auditLogCsv([
      entry({ id: 3, tableName: "invoice_items", rowId: 11, parentId: 7, action: "delete" }),
    ]);
    expect(csv).toContain("\r\n3;2026-05-22 14:30:05;invoice_items;11;7;delete;;\r\n");
  });

  it("leaves Beleg empty for tables without an invoice", () => {
    expect(auditLogCsv([entry({ tableName: "customers", rowId: 4 })])).toContain(";customers;4;;insert;");
  });

  it("quotes values holding semicolons, quotes and line breaks", () => {
    const csv = auditLogCsv([
      entry({ action: "update", oldValues: { notes: 'a;"b"\nc' }, newValues: { notes: "x" } }),
    ]);
    expect(csv).toContain(`"${JSON.stringify({ notes: 'a;"b"\nc' }).replace(/"/g, '""')}"`);
    expect(csv).toContain(';"{""notes"":""x""}"\r\n');
  });
});
