import { describe, expect, it } from "vitest";
import { computeLineTotal, computeTotals } from "$lib/utils/totals";
import {
  BILLING_UNIT,
  centiHoursOf,
  previewBilling,
  roundUpToIncrement,
  type BillableEntry,
  type BillingOptions,
} from "./billing";

const day = (d: number) => new Date(2026, 4, d).getTime() / 1000;

function entry(overrides: Partial<BillableEntry> & Pick<BillableEntry, "id">): BillableEntry {
  return {
    projectId: 1,
    projectName: "Website",
    hourlyRateCent: 9_500,
    entryDate: day(5),
    description: "",
    durationMinutes: 60,
    ...overrides,
  };
}

const OPTIONS: BillingOptions = { grouping: "perProject", incrementMinutes: 1, vatRate: 19 };

describe("centiHoursOf", () => {
  it.each([
    [0, 0],
    [1, 2],
    [2, 3],
    [3, 5],
    [9, 15],
    [18, 30],
    [21, 35],
    [29, 48],
    [30, 50],
    [60, 100],
    [90, 150],
    [100, 167],
  ])("%i minutes -> %i hundredths", (minutes, centiHours) => {
    expect(centiHoursOf(minutes)).toBe(centiHours);
  });
});

describe("line total", () => {
  const lineTotalFor = (minutes: number, hourlyRateCent: number) =>
    previewBilling([entry({ id: 1, durationMinutes: minutes, hourlyRateCent })], OPTIONS).lines[0].lineTotal;

  it("is the integer product of hundredths and rate, half up, for every minute and realistic rate", () => {
    for (const rate of [1, 4_750, 6_250, 8_333, 8_550, 9_500, 9_550, 12_000, 12_345, 99_999]) {
      for (let minutes = 0; minutes <= 6_000; minutes++) {
        const exact = Math.floor((centiHoursOf(minutes) * rate + 50) / 100);
        if (lineTotalFor(minutes, rate) !== exact) {
          throw new Error(`${minutes} min at ${rate}: ${lineTotalFor(minutes, rate)} != ${exact}`);
        }
      }
    }
  });

  it("is what the invoice computes for the line", () => {
    // 4,10 Std x 0,15 EUR is exactly 61,5 cent; 4.1 * 15 is 61.49999999999999 in floating point.
    const line = previewBilling([entry({ id: 1, durationMinutes: 246, hourlyRateCent: 15 })], OPTIONS).lines[0];

    expect(line.lineTotal).toBe(computeLineTotal(line));
    expect(line.lineTotal).toBe(62);
  });

  it("rounds half a cent up", () => {
    expect(lineTotalFor(30, 8_333)).toBe(4_167);
  });
});

describe("roundUpToIncrement", () => {
  it.each([
    [1, 1, 1],
    [1, 6, 6],
    [6, 6, 6],
    [7, 6, 12],
    [16, 15, 30],
    [31, 30, 60],
    [0, 15, 0],
  ] as const)("%i min at increment %i -> %i", (minutes, increment, expected) => {
    expect(roundUpToIncrement(minutes, increment)).toBe(expected);
  });

  it("gives exact hour decimals for the 6, 15 and 30 minute increments", () => {
    for (const increment of [6, 15, 30] as const) {
      for (let minutes = 1; minutes <= 600; minutes++) {
        const billed = roundUpToIncrement(minutes, increment);
        expect(centiHoursOf(billed) * 60).toBe(billed * 100);
      }
    }
  });
});

describe("previewBilling per project", () => {
  const entries = [
    entry({ id: 2, entryDate: day(7), durationMinutes: 45, description: "Review" }),
    entry({ id: 1, entryDate: day(5), durationMinutes: 90, description: "Konzept" }),
    entry({ id: 3, projectId: 2, projectName: "App", hourlyRateCent: 12_000, entryDate: day(6), durationMinutes: 15 }),
  ];

  it("makes one line per project from the summed minutes", () => {
    const { lines } = previewBilling(entries, OPTIONS);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      description: "Website",
      quantity: 2.25,
      unit: BILLING_UNIT,
      unitPrice: 9_500,
      vatRate: 19,
      lineTotal: 21_375,
      billedMinutes: 135,
      entryIds: [1, 2],
    });
    expect(lines[1]).toMatchObject({ description: "App", quantity: 0.25, lineTotal: 3_000, entryIds: [3] });
  });

  it("lists the entries in the long description, oldest first", () => {
    const [website] = previewBilling(entries, OPTIONS).lines;

    expect(website.longDescription).toBe("05.05.2026 · 1:30 · Konzept\n07.05.2026 · 0:45 · Review");
  });

  it("leaves the description part out for an entry without one", () => {
    const [line] = previewBilling([entry({ id: 1, durationMinutes: 30 })], OPTIONS).lines;

    expect(line.longDescription).toBe("05.05.2026 · 0:30");
  });

  it("spans each line over its own work days and the invoice over all of them", () => {
    const preview = previewBilling(entries, OPTIONS);

    expect([preview.lines[0].linePeriodStart, preview.lines[0].linePeriodEnd]).toEqual([day(5), day(7)]);
    expect([preview.lines[1].linePeriodStart, preview.lines[1].linePeriodEnd]).toEqual([day(6), day(6)]);
    expect([preview.servicePeriodStart, preview.servicePeriodEnd]).toEqual([day(5), day(7)]);
  });

  it("sums the lines into the subtotal", () => {
    expect(previewBilling(entries, OPTIONS).subtotalCent).toBe(24_375);
  });

  it("applies the increment to the summed minutes of the position, not per entry", () => {
    const two = [entry({ id: 1, durationMinutes: 7 }), entry({ id: 2, durationMinutes: 7 })];

    const [line] = previewBilling(two, { ...OPTIONS, incrementMinutes: 15 }).lines;

    expect(line.billedMinutes).toBe(15);
    expect(line.quantity).toBe(0.25);
  });
});

describe("previewBilling per entry", () => {
  const options: BillingOptions = { ...OPTIONS, grouping: "perEntry" };

  it("makes one single-day line per entry", () => {
    const { lines } = previewBilling(
      [
        entry({ id: 1, entryDate: day(5), durationMinutes: 90, description: "Konzept" }),
        entry({ id: 2, entryDate: day(6), durationMinutes: 30 }),
      ],
      options,
    );

    expect(lines.map((l) => l.description)).toEqual(["Konzept", "Website"]);
    expect(lines.map((l) => l.longDescription)).toEqual([null, null]);
    expect(lines.map((l) => [l.linePeriodStart, l.linePeriodEnd])).toEqual([
      [day(5), day(5)],
      [day(6), day(6)],
    ]);
    expect(lines.map((l) => l.entryIds)).toEqual([[1], [2]]);
  });

  it("rounds every entry up to the increment on its own", () => {
    const { lines } = previewBilling(
      [entry({ id: 1, durationMinutes: 7 }), entry({ id: 2, durationMinutes: 7 })],
      { ...options, incrementMinutes: 15 },
    );

    expect(lines.map((l) => l.billedMinutes)).toEqual([15, 15]);
  });
});

describe("previewBilling edge cases", () => {
  it("returns no lines and no period for no entries", () => {
    expect(previewBilling([], OPTIONS)).toEqual({
      lines: [],
      servicePeriodStart: null,
      servicePeriodEnd: null,
      subtotalCent: 0,
    });
  });

  it("agrees with the invoice totals computed from its own lines", () => {
    const preview = previewBilling(
      [entry({ id: 1, durationMinutes: 100, hourlyRateCent: 8_333 }), entry({ id: 2, projectId: 2, durationMinutes: 37 })],
      OPTIONS,
    );

    expect(computeTotals(preview.lines, { isKleinunternehmer: false, isReverseCharge: false }).subtotal).toBe(
      preview.subtotalCent,
    );
  });
});
