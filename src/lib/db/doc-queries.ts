import { containsPattern, execute, select } from "./client";
import { periodForYear } from "$lib/dashboard/period";
import { computeLineTotal, roundQuantity, type TotalsItem } from "$lib/utils/totals";

/** Shown wherever a customer or vendor name is missing. */
export const MISSING_NAME = "—";

export const DEFAULT_CURRENCY = "EUR";
export const DEFAULT_PDF_LANGUAGE = "de";

type DocumentTable = "invoices" | "offers" | "expenses";
type LineItemTable = "invoice_items" | "offer_items" | "expense_items";

export type DocumentFilter = {
  status?: string;
  year?: number | "all";
  partyId?: number | "all";
  search?: string;
};

/**
 * WHERE clause shared by the invoice, offer and expense lists.
 * `alias` is the document table alias, `searchColumns` the (qualified) columns the search term is matched against.
 */
export function buildDocumentFilter(
  alias: string,
  partyColumn: string,
  searchColumns: string[],
  filter: DocumentFilter,
): { where: string; binds: unknown[] } {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (filter.status && filter.status !== "all") {
    conditions.push(`${alias}.status = ?`);
    binds.push(filter.status);
  }
  if (filter.partyId && filter.partyId !== "all") {
    conditions.push(`${alias}.${partyColumn} = ?`);
    binds.push(filter.partyId);
  }
  if (filter.year && filter.year !== "all") {
    const { start, end } = periodForYear(filter.year);
    conditions.push(`${alias}.issue_date >= ? AND ${alias}.issue_date < ?`);
    binds.push(start, end);
  }
  const pattern = containsPattern(filter.search ?? "");
  if (pattern !== null) {
    conditions.push(`(${searchColumns.map((column) => `${column} LIKE ?`).join(" OR ")})`);
    binds.push(...searchColumns.map(() => pattern));
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    binds,
  };
}

/** Years in local time, matching how issue dates are entered and filtered. */
export async function listYears(table: DocumentTable): Promise<number[]> {
  const rows = await select<{ y: number }>(
    `SELECT DISTINCT CAST(strftime('%Y', issue_date, 'unixepoch', 'localtime') AS INTEGER) AS y FROM ${table} ORDER BY y DESC`,
  );
  return rows.map((r) => r.y).filter((y) => Number.isFinite(y));
}

type LineItemInput = TotalsItem & { description: string; unit: string };

/**
 * Replaces all line items of a document. `extraColumns` supplies the columns that
 * differ per table; the table and column names are code constants, never user input.
 */
export async function writeLineItems<T extends LineItemInput>(
  table: LineItemTable,
  parentColumn: string,
  parentId: number,
  items: T[],
  extraColumns: (item: T) => Record<string, unknown>,
): Promise<void> {
  // Before the DELETE: a missing quantity must not leave the document without its old items.
  const quantities = items.map((item) => roundQuantity(item.quantity));
  await execute(`DELETE FROM ${table} WHERE ${parentColumn} = ?`, [parentId]);
  for (const [index, item] of items.entries()) {
    const extra = extraColumns(item);
    const columns = [
      parentColumn,
      "position",
      "description",
      "quantity",
      "unit",
      "unit_price",
      "vat_rate",
      "line_total",
      ...Object.keys(extra),
    ];
    await execute(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      [
        parentId,
        index + 1,
        item.description,
        quantities[index],
        item.unit,
        item.unitPrice,
        item.vatRate,
        computeLineTotal(item),
        ...Object.values(extra),
      ],
    );
  }
}

export type DatedLineItemInput = {
  longDescription?: string | null;
  linePeriodStart?: number | null;
  linePeriodEnd?: number | null;
};

/** The extra columns invoice and offer line items have in common. */
export function datedLineColumns(item: DatedLineItemInput): Record<string, unknown> {
  return {
    long_description: item.longDescription ?? null,
    line_period_start: item.linePeriodStart ?? null,
    line_period_end: item.linePeriodEnd ?? null,
  };
}

export type DatedLineItemRow = {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  line_total: number;
  long_description: string | null;
  line_period_start: number | null;
  line_period_end: number | null;
};

/** The item fields invoice and offer rows have in common. */
export function mapDatedLineItem(r: DatedLineItemRow) {
  return {
    position: r.position,
    description: r.description,
    quantity: r.quantity,
    unit: r.unit,
    unitPrice: r.unit_price,
    vatRate: r.vat_rate,
    lineTotal: r.line_total,
    longDescription: r.long_description,
    linePeriodStart: r.line_period_start,
    linePeriodEnd: r.line_period_end,
  };
}
