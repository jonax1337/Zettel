import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { listExpenseListCategories, listExpenses } from "./expenses";

type ItemSeed = { category?: string | null; categoryId?: number | null; lineTotal: number };

let counter = 0;
function seedExpense(items: ItemSeed[]): number {
  counter += 1;
  const db = sqlite.current!;
  const id = Number(
    db
      .prepare(
        "INSERT INTO expenses (internal_number, vendor_id, issue_date, status) VALUES (?, 1, 1000, 'open')",
      )
      .run(`EX-${counter}`).lastInsertRowid,
  );
  items.forEach((item, index) =>
    db
      .prepare(
        "INSERT INTO expense_items (expense_id, position, category, category_id, line_total) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, index, item.category ?? null, item.categoryId ?? null, item.lineTotal),
  );
  return id;
}

const rowOf = async (id: number) => (await listExpenses()).find((e) => e.id === id)!;

const curatedCategory = () =>
  sqlite.current!.prepare("SELECT id, name FROM expense_categories ORDER BY id LIMIT 1").all()[0] as {
    id: number;
    name: string;
  };

beforeEach(() => {
  counter = 0;
  sqlite.current = migratedDatabase();
  sqlite.current.exec("INSERT INTO vendors (id, vendor_number, name) VALUES (1, 'L-0001', 'Office Depot')");
});

describe("listExpenses categories", () => {
  it("shows the shared category when all items have the same one", async () => {
    const id = seedExpense([
      { category: "Reisekosten", lineTotal: 1_000 },
      { category: "Reisekosten", lineTotal: 500 },
    ]);

    expect(await rowOf(id)).toMatchObject({ mainCategory: "Reisekosten", extraCategoryCount: 0 });
  });

  it("shows the category of the largest item and counts the other distinct categories", async () => {
    const id = seedExpense([
      { category: "Bürobedarf", lineTotal: 500 },
      { category: "Software / SaaS", lineTotal: 9_000 },
      { category: "Reisekosten", lineTotal: 700 },
      { category: "Reisekosten", lineTotal: 100 },
    ]);

    expect(await rowOf(id)).toMatchObject({ mainCategory: "Software / SaaS", extraCategoryCount: 2 });
  });

  it("prefers the curated category's name over the free text and ignores items without a category", async () => {
    const curated = curatedCategory();
    const id = seedExpense([
      { category: "altes Label", categoryId: curated.id, lineTotal: 2_000 },
      { category: "", lineTotal: 5_000 },
      { category: null, lineTotal: 8_000 },
    ]);

    expect(await rowOf(id)).toMatchObject({ mainCategory: curated.name, extraCategoryCount: 0 });
  });

  it("leaves the categories out when the caller does not need them", async () => {
    const id = seedExpense([{ category: "Reisekosten", lineTotal: 1_000 }]);

    const row = (await listExpenses({}, { categories: false })).find((e) => e.id === id);

    expect(row).toMatchObject({ vendorName: "Office Depot", mainCategory: null, extraCategoryCount: 0 });
  });

  it("has no category without items or without any category on them", async () => {
    const empty = seedExpense([]);
    const uncategorised = seedExpense([{ lineTotal: 100 }]);

    expect(await rowOf(empty)).toMatchObject({ mainCategory: null, extraCategoryCount: 0 });
    expect(await rowOf(uncategorised)).toMatchObject({ mainCategory: null, extraCategoryCount: 0 });
  });
});

describe("listExpenses category filter", () => {
  it("finds an expense by any of its items' categories, not only the one the list shows", async () => {
    const mixed = seedExpense([
      { category: "Software / SaaS", lineTotal: 9_000 },
      { category: "Reisekosten", lineTotal: 700 },
    ]);
    const travel = seedExpense([{ category: "Reisekosten", lineTotal: 1_000 }]);
    seedExpense([{ category: "Bürobedarf", lineTotal: 1_000 }]);
    seedExpense([]);

    const found = await listExpenses({ category: "Reisekosten" });

    expect(found.map((e) => e.id).sort()).toEqual([mixed, travel].sort());
  });

  it("matches the curated category's name, as the list shows it, instead of an item's old free text", async () => {
    const curated = curatedCategory();
    const id = seedExpense([{ category: "altes Label", categoryId: curated.id, lineTotal: 2_000 }]);

    expect((await listExpenses({ category: curated.name })).map((e) => e.id)).toEqual([id]);
    expect(await listExpenses({ category: "altes Label" })).toEqual([]);
  });

  it("combines with the other filters and leaves the list alone for 'all'", async () => {
    const open = seedExpense([{ category: "Reisekosten", lineTotal: 1_000 }]);
    const paid = seedExpense([{ category: "Reisekosten", lineTotal: 1_000 }]);
    sqlite.current!.prepare("UPDATE expenses SET status = 'paid' WHERE id = ?").run(paid);

    expect((await listExpenses({ category: "Reisekosten", status: "open" })).map((e) => e.id)).toEqual([open]);
    expect(await listExpenses({ category: "all" })).toHaveLength(2);
  });

  it("keeps its bind in place next to search, vendor and year", async () => {
    const db = sqlite.current!;
    db.exec("INSERT INTO vendors (id, vendor_number, name) VALUES (2, 'L-0002', 'Cloud AG')");
    const match = seedExpense([{ category: "Reisekosten", lineTotal: 1_000 }]);
    const otherVendor = seedExpense([{ category: "Reisekosten", lineTotal: 1_000 }]);
    const otherYear = seedExpense([{ category: "Reisekosten", lineTotal: 1_000 }]);
    const otherCategory = seedExpense([{ category: "Bürobedarf", lineTotal: 1_000 }]);
    const in2026 = Math.floor(new Date(2026, 5, 1).getTime() / 1000);
    db.prepare("UPDATE expenses SET issue_date = ? WHERE id IN (?, ?, ?)").run(in2026, match, otherVendor, otherCategory);
    db.prepare("UPDATE expenses SET vendor_id = 2 WHERE id = ?").run(otherVendor);
    db.prepare("UPDATE expenses SET issue_date = ? WHERE id = ?").run(Math.floor(new Date(2025, 5, 1).getTime() / 1000), otherYear);

    const found = await listExpenses({ category: "Reisekosten", search: "Office", vendorId: 1, year: 2026 });

    expect(found.map((e) => e.id)).toEqual([match]);
  });
});

describe("listExpenseListCategories", () => {
  it("lists each category once, without regard to case; a curated name replaces the item's free text", async () => {
    const curated = curatedCategory();
    seedExpense([
      { category: "Zzz frei", lineTotal: 100 },
      { category: "aaa frei", lineTotal: 100 },
      { category: "altes Label", categoryId: curated.id, lineTotal: 100 },
    ]);
    seedExpense([{ category: "Zzz frei", lineTotal: 100 }, { category: "", lineTotal: 100 }, { lineTotal: 100 }]);

    const listed = await listExpenseListCategories();

    expect([...listed].sort()).toEqual(["Zzz frei", "aaa frei", curated.name].sort());
    expect(listed.indexOf("aaa frei")).toBeLessThan(listed.indexOf("Zzz frei"));
  });
});
