import { select } from "./client";

type Reference = { table: string; column: string; one: string; many: string };

const CUSTOMER_REFERENCES: readonly Reference[] = [
  { table: "invoices", column: "customer_id", one: "Rechnung", many: "Rechnungen" },
  { table: "offers", column: "customer_id", one: "Angebot", many: "Angebote" },
  { table: "recurring_invoices", column: "customer_id", one: "Vorlage", many: "Vorlagen" },
];

const VENDOR_REFERENCES: readonly Reference[] = [
  { table: "expenses", column: "vendor_id", one: "Eingangsrechnung", many: "Eingangsrechnungen" },
];

export type ReferenceCount = { one: string; many: string; count: number };

/** German refusal listing what still points at the record, or null when nothing does. */
export function deletionBlockedMessage(subject: string, counts: ReferenceCount[]): string | null {
  const used = counts.filter((c) => c.count > 0);
  if (used.length === 0) return null;
  const list = used.map((c) => `${c.count} ${c.count === 1 ? c.one : c.many}`).join(", ");
  return `${subject} kann nicht gelöscht werden, es gibt noch ${list}.`;
}

async function countReferences(references: readonly Reference[], id: number): Promise<ReferenceCount[]> {
  // Table and column names come from the constants above, never from input.
  const columns = references
    .map((r, i) => `(SELECT COUNT(*) FROM ${r.table} WHERE ${r.column} = ?) AS c${i}`)
    .join(", ");
  const [row] = await select<Record<string, number>>(
    `SELECT ${columns}`,
    references.map(() => id),
  );
  return references.map((r, i) => ({ one: r.one, many: r.many, count: row?.[`c${i}`] ?? 0 }));
}

export async function assertCustomerDeletable(customerId: number): Promise<void> {
  const message = deletionBlockedMessage("Der Kunde", await countReferences(CUSTOMER_REFERENCES, customerId));
  if (message) throw new Error(message);
}

export async function assertVendorDeletable(vendorId: number): Promise<void> {
  const message = deletionBlockedMessage("Der Lieferant", await countReferences(VENDOR_REFERENCES, vendorId));
  if (message) throw new Error(message);
}
