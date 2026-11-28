import { describe, expect, it } from "vitest";
import { BAR_REMEDY, billingBlocker, isBillable, SUMMARY_REMEDY } from "./selection";

describe("isBillable", () => {
  it("accepts a finished entry that is on no invoice", () => {
    expect(isBillable({ invoiceId: null, durationMinutes: 30 })).toBe(true);
  });

  it("refuses a billed entry and a running timer", () => {
    expect(isBillable({ invoiceId: 4, durationMinutes: 30 })).toBe(false);
    expect(isBillable({ invoiceId: null, durationMinutes: null })).toBe(false);
  });
});

describe("billingBlocker", () => {
  it("has nothing to say about entries of one customer", () => {
    expect(billingBlocker([{ customerId: 1 }, { customerId: 1 }], BAR_REMEDY)).toBeNull();
  });

  it("explains that an invoice takes one customer only", () => {
    expect(billingBlocker([{ customerId: 1 }, { customerId: 2 }], SUMMARY_REMEDY)).toBe(
      "Eine Rechnung kann nur Einträge eines Kunden enthalten. Filtere auf einen Kunden, um seine offenen Zeiten abzurechnen.",
    );
  });
});
