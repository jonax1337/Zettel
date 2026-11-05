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
  templatePrefillRejection,
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
  reverse_charge_type: "intra_eu",
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
    execute.mockResolvedValue({ rowsAffected: 1 });
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
    reverseChargeType: "intra_eu",
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

  it.each(["none", "intra_eu", "third_country"] as const)(
    "stores and hands on the reverse-charge type %s",
    async (reverseChargeType) => {
      insert.mockResolvedValueOnce(4);
      await createRecurring({ ...formInput, reverseChargeType });
      const [sql, binds] = insert.mock.calls[0];
      expect(insertedValues(sql, binds)).toMatchObject({
        reverse_charge_type: reverseChargeType,
        is_reverse_charge: reverseChargeType === "none" ? 0 : 1,
      });

      const stored = insertedValues(sql, binds);
      select
        .mockResolvedValueOnce([
          {
            ...recurringRow,
            is_reverse_charge: stored.is_reverse_charge,
            reverse_charge_type: stored.reverse_charge_type,
          },
        ])
        .mockResolvedValueOnce([]);
      execute.mockResolvedValue({ rowsAffected: 1 });
      await generateInvoiceFromRecurring(4);
      expect(createInvoice).toHaveBeenCalledWith(expect.objectContaining({ reverseChargeType }));
    },
  );

  it("reads a legacy row that only has the boolean as intra-EU", () => {
    expect(mapRecurring({ ...recurringRow, reverse_charge_type: "none" }).reverseChargeType).toBe("intra_eu");
    expect(
      mapRecurring({ ...recurringRow, is_reverse_charge: 0, reverse_charge_type: "none" }).reverseChargeType,
    ).toBe("none");
  });
});

describe("generateInvoiceFromRecurring", () => {
  beforeEach(() => {
    execute.mockReset();
    select.mockReset();
    createInvoice.mockReset();
    select.mockResolvedValueOnce([recurringRow]).mockResolvedValueOnce([]);
  });

  it("claims the due period before creating the invoice", async () => {
    const order: string[] = [];
    execute.mockImplementation(async () => {
      order.push("claim");
      return { rowsAffected: 1 };
    });
    createInvoice.mockImplementation(async () => {
      order.push("invoice");
      return 77;
    });

    expect(await generateInvoiceFromRecurring(4)).toBe(77);

    expect(order).toEqual(["claim", "invoice"]);
    const [sql, binds] = execute.mock.calls[0];
    expect(sql).toContain("WHERE id = ? AND next_due_date = ?");
    expect(binds.slice(2)).toEqual([4, recurringRow.next_due_date]);
  });

  it("creates no second invoice when a concurrent click already claimed the period", async () => {
    execute.mockResolvedValue({ rowsAffected: 0 });

    await expect(generateInvoiceFromRecurring(4)).rejects.toThrow("bereits eine Rechnung");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("releases the claim when the invoice cannot be created", async () => {
    execute.mockResolvedValue({ rowsAffected: 1 });
    createInvoice.mockRejectedValueOnce(new Error("Customer 2 not found"));

    await expect(generateInvoiceFromRecurring(4)).rejects.toThrow("Customer 2 not found");

    const [, releaseBinds] = execute.mock.calls[1];
    expect(releaseBinds.slice(0, 3)).toEqual([null, recurringRow.next_due_date, 4]);
  });
});

describe("templatePrefillRejection", () => {
  it("accepts a EUR invoice", () => {
    expect(templatePrefillRejection({ currency: "EUR" })).toBeNull();
  });

  it("refuses a foreign-currency invoice, whose prices would be taken as EUR", () => {
    expect(templatePrefillRejection({ currency: "USD" })).toContain("USD");
  });
});
