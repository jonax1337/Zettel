import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, select } = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn() }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  execute,
  select,
}));

import {
  buildDocumentFilter,
  datedLineColumns,
  listYears,
  mapDatedLineItem,
  writeLineItems,
} from "./doc-queries";

beforeEach(() => {
  execute.mockReset().mockResolvedValue({});
  select.mockReset();
});

describe("buildDocumentFilter", () => {
  const build = (filter: Parameters<typeof buildDocumentFilter>[3]) =>
    buildDocumentFilter("o", "customer_id", ["o.number", "c.name"], filter);

  it("returns no WHERE clause without active filters", () => {
    expect(build({})).toEqual({ where: "", binds: [] });
    expect(build({ status: "all", year: "all", partyId: "all", search: "   " })).toEqual({
      where: "",
      binds: [],
    });
  });

  it("combines all filters into one parameterized clause", () => {
    const { where, binds } = build({ status: "sent", partyId: 4, year: 2026, search: " acme " });
    expect(where).toBe(
      "WHERE o.status = ? AND o.customer_id = ? AND o.issue_date >= ? AND o.issue_date < ? AND (o.number LIKE ? OR c.name LIKE ?)",
    );
    expect(binds).toEqual([
      "sent",
      4,
      new Date(2026, 0, 1).getTime() / 1000,
      new Date(2027, 0, 1).getTime() / 1000,
      "%acme%",
      "%acme%",
    ]);
  });

  it("binds the search pattern once per search column", () => {
    const { where, binds } = buildDocumentFilter("e", "vendor_id", ["e.a", "e.b", "v.name"], {
      search: "x",
    });
    expect(where).toBe("WHERE (e.a LIKE ? OR e.b LIKE ? OR v.name LIKE ?)");
    expect(binds).toEqual(["%x%", "%x%", "%x%"]);
  });
});

describe("listYears", () => {
  it("reads the distinct local years of the given table", async () => {
    select.mockResolvedValue([{ y: 2026 }, { y: 2025 }, { y: Number.NaN }]);
    await expect(listYears("offers")).resolves.toEqual([2026, 2025]);
    expect(select.mock.calls[0][0]).toContain("FROM offers");
  });
});

describe("writeLineItems", () => {
  const item = { description: "Arbeit", quantity: 1.5, unit: "h", unitPrice: 1_001, vatRate: 19 };

  it("replaces existing items and inserts positions with computed line totals", async () => {
    await writeLineItems("offer_items", "offer_id", 9, [item, item], () => ({ note: "n" }));

    expect(execute).toHaveBeenNthCalledWith(1, "DELETE FROM offer_items WHERE offer_id = ?", [9]);
    expect(execute).toHaveBeenCalledTimes(3);
    const [sql, binds] = execute.mock.calls[2];
    expect(sql).toBe(
      "INSERT INTO offer_items (offer_id, position, description, quantity, unit, unit_price, vat_rate, line_total, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    expect(binds).toEqual([9, 2, "Arbeit", 1.5, "h", 1_001, 19, 1_502, "n"]);
  });

  it("only deletes when there are no items", async () => {
    await writeLineItems("invoice_items", "invoice_id", 1, [], datedLineColumns);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("dated line items", () => {
  it("defaults missing optional fields to null", () => {
    expect(datedLineColumns({})).toEqual({
      long_description: null,
      line_period_start: null,
      line_period_end: null,
    });
  });

  it("maps the shared row fields", () => {
    expect(
      mapDatedLineItem({
        position: 1,
        description: "A",
        quantity: 2,
        unit: "h",
        unit_price: 100,
        vat_rate: 19,
        line_total: 200,
        long_description: "lang",
        line_period_start: 10,
        line_period_end: 20,
      }),
    ).toEqual({
      position: 1,
      description: "A",
      quantity: 2,
      unit: "h",
      unitPrice: 100,
      vatRate: 19,
      lineTotal: 200,
      longDescription: "lang",
      linePeriodStart: 10,
      linePeriodEnd: 20,
    });
  });
});
