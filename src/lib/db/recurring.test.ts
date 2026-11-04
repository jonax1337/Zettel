import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, insert, select, createInvoice } = vi.hoisted(() => ({
  execute: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  createInvoice: vi.fn(),
}));
vi.mock("./client", () => ({ execute, insert, select }));
vi.mock("./invoices", () => ({ createInvoice }));

import {
  addInterval,
  createRecurring,
  generateInvoiceFromRecurring,
  mapRecurring,
  updateRecurring,
  type RecurringFormInput,
} from "./recurring";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime() / 1000;
const dayOf = (unix: number) => new Date(unix * 1000).toDateString();

describe("addInterval", () => {
  it("adds one month, quarter and year", () => {
    expect(dayOf(addInterval(at(2026, 1, 15), "monthly"))).toBe(dayOf(at(2026, 2, 15)));
    expect(dayOf(addInterval(at(2026, 1, 15), "quarterly"))).toBe(dayOf(at(2026, 4, 15)));
    expect(dayOf(addInterval(at(2026, 1, 15), "yearly"))).toBe(dayOf(at(2027, 1, 15)));
  });

  it("clamps to the last day of a shorter month instead of overflowing", () => {
    expect(dayOf(addInterval(at(2026, 1, 31), "monthly"))).toBe(dayOf(at(2026, 2, 28)));
    expect(dayOf(addInterval(at(2028, 1, 31), "monthly"))).toBe(dayOf(at(2028, 2, 29)));
    expect(dayOf(addInterval(at(2026, 11, 30), "quarterly"))).toBe(dayOf(at(2027, 2, 28)));
    expect(dayOf(addInterval(at(2028, 2, 29), "yearly"))).toBe(dayOf(at(2029, 2, 28)));
  });

  it("returns to the anchor day once the month is long enough", () => {
    const clamped = addInterval(at(2026, 1, 31), "monthly", 31);
    expect(dayOf(addInterval(clamped, "monthly", 31))).toBe(dayOf(at(2026, 3, 31)));
  });

  it("rolls over the year boundary", () => {
    expect(dayOf(addInterval(at(2026, 12, 10), "monthly"))).toBe(dayOf(at(2027, 1, 10)));
  });
});

const recurringRow = {
  id: 4,
  name: "Wartung",
  customer_id: 2,
  interval: "monthly" as const,
  start_date: at(2026, 1, 15),
  next_due_date: at(2026, 11, 15),
  last_generated_at: null,
  payment_terms_days: 14,
  is_reverse_charge: 1,
  supply_kind: "services",
  notes: null,
  payment_terms: null,
  active: 1,
  created_at: 1,
  updated_at: 1,
};

describe("recurring supply kind", () => {
  beforeEach(() => {
    execute.mockReset();
    insert.mockReset();
    select.mockReset();
    createInvoice.mockReset();
  });

  it("is read from the stored template", () => {
    expect(mapRecurring(recurringRow).supplyKind).toBe("services");
    expect(mapRecurring({ ...recurringRow, supply_kind: "goods" }).supplyKind).toBe("goods");
  });

  it.each(["goods", "services"] as const)("is handed to the generated invoice: %s", async (supplyKind) => {
    select
      .mockResolvedValueOnce([{ ...recurringRow, supply_kind: supplyKind }])
      .mockResolvedValueOnce([]);
    createInvoice.mockResolvedValueOnce(77);

    await generateInvoiceFromRecurring(4);

    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ reverseChargeType: "intra_eu", supplyKind }),
    );
  });

  const formInput: RecurringFormInput = {
    name: "Wartung",
    customerId: 2,
    interval: "monthly",
    startDate: at(2026, 1, 15),
    paymentTermsDays: 14,
    isReverseCharge: true,
    supplyKind: "services",
    notes: null,
    paymentTerms: null,
    active: true,
    items: [],
  };

  function insertedValues(sql: string, binds: unknown[]): Record<string, unknown> {
    const columns = sql.match(/\(([^)]*)\)\s*VALUES/)![1].split(",").map((c) => c.trim());
    return Object.fromEntries(columns.map((column, i) => [column, binds[i]]));
  }

  function assignedValues(sql: string, binds: unknown[]): Record<string, unknown> {
    const columns = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
    return Object.fromEntries(columns.map((column, i) => [column, binds[i]]));
  }

  it.each(["goods", "services"] as const)("is stored on create: %s", async (supplyKind) => {
    insert.mockResolvedValueOnce(4);

    await createRecurring({ ...formInput, supplyKind });

    const [sql, binds] = insert.mock.calls[0];
    expect(insertedValues(sql, binds)).toMatchObject({ is_reverse_charge: 1, supply_kind: supplyKind });
  });

  it.each(["goods", "services"] as const)("is stored on update: %s", async (supplyKind) => {
    await updateRecurring(4, { ...formInput, supplyKind });

    const [sql, binds] = execute.mock.calls.find(([sql]) => String(sql).includes("UPDATE recurring_invoices"))!;
    expect(assignedValues(sql, binds)).toMatchObject({ is_reverse_charge: 1, supply_kind: supplyKind });
  });
});
