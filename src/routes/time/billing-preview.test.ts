import { describe, expect, it } from "vitest";
import type { BillingLine } from "$lib/time/billing";
import { formatLinePeriod, lineQuantityText, unpricedLineWarning } from "./billing-preview";

const day = (d: number) => new Date(2026, 4, d).getTime() / 1000;

function line(overrides: Partial<BillingLine> = {}): BillingLine {
  return {
    description: "Website",
    longDescription: null,
    quantity: 1.5,
    unit: "Std",
    unitPrice: 9_500,
    vatRate: 19,
    lineTotal: 14_250,
    linePeriodStart: day(5),
    linePeriodEnd: day(5),
    billedMinutes: 90,
    entryIds: [1],
    ...overrides,
  };
}

describe("formatLinePeriod", () => {
  it("names a single day once", () => {
    expect(formatLinePeriod(day(5), day(5))).toBe("5.5.2026");
  });

  it("spans several days", () => {
    expect(formatLinePeriod(day(5), day(7))).toBe("5.5.2026 – 7.5.2026");
  });
});

describe("lineQuantityText", () => {
  it("shows the billed hours with a decimal comma and two decimals", () => {
    expect(lineQuantityText(line({ billedMinutes: 90 }))).toBe("1,50");
    expect(lineQuantityText(line({ billedMinutes: 25 }))).toBe("0,42");
  });
});

describe("unpricedLineWarning", () => {
  it("is silent when every position has a rate", () => {
    expect(unpricedLineWarning([line(), line()])).toBeNull();
  });

  it("warns about one position without a rate", () => {
    expect(unpricedLineWarning([line(), line({ unitPrice: 0, lineTotal: 0 })])).toBe(
      "1 Position hat keinen Stundensatz und wird mit 0,00 € angelegt. Den Satz unter „Projekte“ hinterlegen.",
    );
  });

  it("counts several positions without a rate", () => {
    expect(unpricedLineWarning([line({ unitPrice: 0 }), line({ unitPrice: 0 })])).toContain(
      "2 Positionen haben keinen Stundensatz und werden",
    );
  });
});
