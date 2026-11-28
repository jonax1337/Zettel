import { describe, expect, it } from "vitest";
import { lineItemFromStored } from "../../invoice/line-items";
import { keepsSavedAmount } from "./stored-amounts";

const stored = {
  description: "Wartung",
  quantity: 2,
  unit: "Std",
  unitPrice: 9500,
  vatRate: 19,
  longDescription: null,
  linePeriodStart: null,
  linePeriodEnd: null,
  lineTotal: 19000,
};

describe("keepsSavedAmount", () => {
  it("is true for a stored position that was not touched", () => {
    expect(keepsSavedAmount(lineItemFromStored(stored))).toBe(true);
  });

  it("is false once quantity or price change", () => {
    const edited = lineItemFromStored(stored);
    edited.quantity = 3;
    expect(keepsSavedAmount(edited)).toBe(false);
    const repriced = lineItemFromStored(stored);
    repriced.unitPrice = 10000;
    expect(keepsSavedAmount(repriced)).toBe(false);
  });

  it("is false for a position without a saved amount", () => {
    expect(keepsSavedAmount(lineItemFromStored({ ...stored, lineTotal: undefined }))).toBe(false);
  });
});
