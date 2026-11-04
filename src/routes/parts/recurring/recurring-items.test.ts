import { describe, expect, it } from "vitest";
import { fromIsoDate } from "$lib/utils/date";
import {
  emptyItemRow,
  itemInputFromRow,
  itemRowFromStored,
  paymentTermDays,
} from "./recurring-items";

const stored = {
  description: "Retainer",
  quantity: 2,
  unit: "h",
  unitPrice: 12345,
  vatRate: 19,
  longDescription: "Details",
  linePeriodStart: fromIsoDate("2026-01-01"),
  linePeriodEnd: fromIsoDate("2026-01-31"),
};

describe("itemRowFromStored / itemInputFromRow", () => {
  it("round-trips a stored item with detail text and line period", () => {
    const row = itemRowFromStored(stored);
    expect(row.priceText).toBe("123,45");
    expect(row.showDetail).toBe(true);
    expect(itemInputFromRow(row)).toEqual(stored);
  });

  it("drops the detail text once the detail section is hidden", () => {
    const row = itemRowFromStored(stored);
    row.showDetail = false;
    expect(itemInputFromRow(row).longDescription).toBeNull();
  });

  it("treats whitespace-only detail text as absent", () => {
    const row = { ...emptyItemRow(19), showDetail: true, longDescription: "   " };
    expect(itemInputFromRow(row).longDescription).toBeNull();
  });

  it("maps missing line periods to null", () => {
    const row = itemRowFromStored({ ...stored, linePeriodStart: null, linePeriodEnd: null });
    const input = itemInputFromRow(row);
    expect(input.linePeriodStart).toBeNull();
    expect(input.linePeriodEnd).toBeNull();
  });
});

describe("paymentTermDays", () => {
  const issue = fromIsoDate("2026-03-01");

  it("returns the whole days between issue and due date", () => {
    expect(paymentTermDays(issue, fromIsoDate("2026-03-15"), 7)).toBe(14);
  });

  it("falls back when due on the issue day or earlier", () => {
    expect(paymentTermDays(issue, issue, 7)).toBe(7);
    expect(paymentTermDays(issue, fromIsoDate("2026-02-20"), 7)).toBe(7);
  });
});
