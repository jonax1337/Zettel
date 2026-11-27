import { describe, expect, it } from "vitest";
import { newLineItem } from "../../invoice/line-items";
import { documentErrors } from "./editor-validation";
import { commitPendingPrices } from "./prices";

describe("commitPendingPrices", () => {
  it("turns typed price text into the unit price and writes it back canonically", () => {
    const item = { ...newLineItem(19), description: "Wartung", priceText: "95,5" };
    commitPendingPrices([item]);
    expect(item.unitPrice).toBe(9550);
    expect(item.priceText).toBe("95,50");
  });

  it("lets an offer pass the billable check after Enter submitted an uncommitted price", () => {
    const item = { ...newLineItem(19), description: "Wartung", priceText: "250" };
    const state = {
      customerId: 1,
      customer: null,
      items: [item],
      itemsRule: "billable" as const,
      sender: null,
      reverseChargeType: "none" as const,
    };
    expect(documentErrors(state).items).toBeDefined();
    commitPendingPrices([item]);
    expect(documentErrors(state).items).toBeUndefined();
  });

  it("turns unreadable text into zero instead of keeping an old price", () => {
    const item = { ...newLineItem(19), unitPrice: 5000, priceText: "abc" };
    commitPendingPrices([item]);
    expect(item.unitPrice).toBe(0);
  });
});
