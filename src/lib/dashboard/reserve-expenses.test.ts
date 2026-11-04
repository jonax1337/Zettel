import { describe, expect, it } from "vitest";
import { deductibleExpenseCent, deductsExpensesGross } from "./reserve-expenses";

const sums = { netCent: 10_000, grossCent: 11_900 };

describe("deductibleExpenseCent", () => {
  it("deducts net for a Kleinunternehmer by default", () => {
    const settings = { isKleinunternehmer: true, taxReserveExpensesGross: false };
    expect(deductibleExpenseCent(sums, settings)).toBe(10_000);
  });

  it("deducts gross for a Kleinunternehmer who opted in", () => {
    const settings = { isKleinunternehmer: true, taxReserveExpensesGross: true };
    expect(deductibleExpenseCent(sums, settings)).toBe(11_900);
  });

  it("ignores the gross option for a regular VAT payer", () => {
    const settings = { isKleinunternehmer: false, taxReserveExpensesGross: true };
    expect(deductibleExpenseCent(sums, settings)).toBe(10_000);
    expect(deductsExpensesGross(settings)).toBe(false);
  });
});
