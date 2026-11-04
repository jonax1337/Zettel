import { describe, expect, it } from "vitest";
import { findDuplicateExpense, type ComparableExpense } from "./duplicate-check";

function expense(overrides: Partial<ComparableExpense>): ComparableExpense {
  return {
    id: 1,
    internalNumber: "EX-2026-0001",
    number: "RE-100",
    vendorId: 7,
    issueDate: 1_700_000_000,
    total: 11_900,
    status: "open",
    ...overrides,
  };
}

const candidate = { id: null, vendorId: 7, number: "re-100 ", issueDate: 1_700_000_000, total: 5_000 };

describe("findDuplicateExpense", () => {
  it("matches the same vendor and Beleg-Nr. ignoring case and spaces, whatever the amount", () => {
    const stored = expense({});
    expect(findDuplicateExpense([stored], candidate)).toBe(stored);
  });

  it("ignores other vendors, other numbers, cancelled expenses and the expense being edited", () => {
    const others = [
      expense({ id: 2, vendorId: 8 }),
      expense({ id: 3, number: "RE-101" }),
      expense({ id: 4, status: "cancelled" }),
      expense({ id: 5 }),
    ];
    expect(findDuplicateExpense(others, { ...candidate, id: 5 })).toBeNull();
  });

  it("falls back to amount and invoice date when there is no Beleg-Nr.", () => {
    const noNumber = { ...candidate, number: null, total: 11_900 };
    const stored = expense({ number: null });
    expect(findDuplicateExpense([stored], noNumber)).toBe(stored);
    expect(findDuplicateExpense([stored], { ...noNumber, total: 11_901 })).toBeNull();
    expect(findDuplicateExpense([stored], { ...noNumber, issueDate: 1_700_086_400 })).toBeNull();
  });
});
