import { beforeEach, describe, expect, it, vi } from "vitest";
import { migratedDatabase, type SqliteState } from "./sqlite-test-db";

const sqlite = vi.hoisted((): SqliteState => ({ current: null, beforeExecute: null }));
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  ...(await import("./sqlite-test-db")).sqliteClient(sqlite),
}));

import { listExpenses } from "./expenses";

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
    const curated = sqlite.current!.prepare("SELECT id, name FROM expense_categories ORDER BY id LIMIT 1").all()[0] as {
      id: number;
      name: string;
    };
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
