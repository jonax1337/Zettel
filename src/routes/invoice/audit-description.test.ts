import { describe, expect, it } from "vitest";
import type { AuditEntry } from "$lib/db/audit";
import { formatDate } from "$lib/utils/date";
import { describeAuditEntry } from "./audit-description";

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

function describeEur(audit: AuditEntry): string {
  return describeAuditEntry(audit, "EUR");
}

describe("describeAuditEntry", () => {
  it("describes invoice creation and deletion without details", () => {
    expect(describeEur(entry({ action: "insert", newValues: { id: 7 } }))).toBe("Rechnung angelegt");
    expect(describeEur(entry({ action: "delete", oldValues: { id: 7 } }))).toBe("Rechnung gelöscht");
  });

  it("lists changed invoice columns with labels, status names and money", () => {
    const text = describeEur(
      entry({
        action: "update",
        oldValues: { status: "draft", total: 10000 },
        newValues: { status: "sent", total: 20000 },
      }),
    );
    expect(text).toBe(
      `Rechnung geändert: Status Entwurf → Versendet, Gesamt ${eur(10000)} → ${eur(20000)}`,
    );
  });

  it("formats dates and shows a dash for a missing old value", () => {
    const sentAt = Math.floor(new Date(2026, 4, 22, 12).getTime() / 1000);
    const text = describeEur(
      entry({ action: "update", oldValues: { sent_at: null }, newValues: { sent_at: sentAt } }),
    );
    expect(text).toBe(`Rechnung geändert: Versendet am – → ${formatDate(sentAt)}`);
  });

  it("formats amounts in the invoice currency", () => {
    const text = describeAuditEntry(
      entry({ action: "update", oldValues: { total: 100 }, newValues: { total: 200 } }),
      "USD",
    );
    expect(text).toContain("$");
  });

  it("prefers a currency recorded in the entry itself", () => {
    const text = describeEur(
      entry({ action: "update", oldValues: { total: 100, currency: "EUR" }, newValues: { total: 200, currency: "USD" } }),
    );
    expect(text).toContain("$");
  });

  it("formats the frozen EUR total in EUR on a foreign-currency invoice", () => {
    const text = describeAuditEntry(
      entry({ action: "update", oldValues: { eur_total_cent: 100 }, newValues: { eur_total_cent: 200 } }),
      "USD",
    );
    expect(text).toBe(`Rechnung geändert: Gesamt (EUR) ${eur(100)} → ${eur(200)}`);
  });

  it("describes event columns as phrases without values", () => {
    const text = describeEur(
      entry({
        action: "update",
        oldValues: { pdf_path: null, customer_snapshot: "{}" },
        newValues: { pdf_path: "a.pdf", customer_snapshot: '{"name":"X"}' },
      }),
    );
    expect(text).toBe("Rechnung geändert: PDF erzeugt, Kundendaten eingefroren");
  });

  it("falls back to the raw column name for unknown columns", () => {
    const text = describeEur(
      entry({ action: "update", oldValues: { mystery_column: "a" }, newValues: { mystery_column: "b" } }),
    );
    expect(text).toBe("Rechnung geändert: mystery_column a → b");
  });

  it("names the item description on insert and delete", () => {
    expect(
      describeEur(entry({ tableName: "invoice_items", action: "insert", newValues: { description: "Beratung" } })),
    ).toBe("Position hinzugefügt: Beratung");
    expect(
      describeEur(entry({ tableName: "invoice_items", action: "delete", oldValues: { description: "Beratung" } })),
    ).toBe("Position entfernt: Beratung");
  });

  it("lists changed item columns on update", () => {
    const text = describeEur(
      entry({ tableName: "invoice_items", action: "update", oldValues: { quantity: 1 }, newValues: { quantity: 2 } }),
    );
    expect(text).toBe("Position geändert: Menge 1 → 2");
  });

  it("shows the amount of a payment", () => {
    const payment = (action: AuditEntry["action"], values: AuditEntry["newValues"]) =>
      entry({
        tableName: "invoice_payments",
        action,
        newValues: action === "delete" ? null : values,
        oldValues: action === "delete" ? values : null,
      });
    expect(describeEur(payment("insert", { amount_cent: 5000 }))).toBe(`Zahlung erfasst: ${eur(5000)}`);
    expect(describeEur(payment("delete", { amount_cent: 5000 }))).toBe(`Zahlung gelöscht: ${eur(5000)}`);
    expect(
      describeEur(
        entry({ tableName: "invoice_payments", action: "update", oldValues: { amount_cent: 5000 }, newValues: { amount_cent: 6000 } }),
      ),
    ).toBe(`Zahlung geändert: Betrag ${eur(5000)} → ${eur(6000)}`);
  });

  it("describes reminders by level", () => {
    expect(describeEur(entry({ tableName: "reminders", action: "insert", newValues: { level: 2 } }))).toBe(
      "Mahnung angelegt: Stufe 2",
    );
    expect(
      describeEur(
        entry({ tableName: "reminders", action: "update", oldValues: { fee_cents: 0 }, newValues: { fee_cents: 500 } }),
      ),
    ).toBe(`Mahnung geändert: Gebühr ${eur(0)} → ${eur(500)}`);
  });

  it("describes a partial restore and unknown tables", () => {
    expect(describeEur(entry({ action: "restore", tableName: "backup", rowId: 0 }))).toBe(
      "Teilwiederherstellung aus Backup",
    );
    expect(describeEur(entry({ tableName: "customers", action: "insert" }))).toBe("customers: insert");
  });
});

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
