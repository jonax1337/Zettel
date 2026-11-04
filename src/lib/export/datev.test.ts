import { describe, it, expect } from "vitest";
import type { Invoice, InvoiceItem } from "$lib/db/schema";
import {
  buildDatevCsv,
  datevRangeError,
  defaultDatevFilename,
  SKR03,
  SKR04,
  UTF8_BOM,
  type DatevExportOpts,
} from "./datev";

const opts: DatevExportOpts = {
  beraternr: 1001,
  mandantennr: 1,
  wjBeginn: new Date(2026, 0, 1),
  dateFrom: new Date(2026, 0, 1),
  dateTo: new Date(2026, 11, 31),
  sachkontenlaenge: 4,
  bezeichnung: "Zettel Test Export",
  accounts: SKR03,
};

describe("buildDatevCsv (empty)", () => {
  const csv = buildDatevCsv({ invoices: [], expenses: [] }, opts, new Date(2026, 4, 17, 12, 0, 0));

  it("starts with UTF-8 BOM", () => {
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
  });

  it("uses CRLF line endings", () => {
    expect(csv).toContain("\r\n");
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  it("emits exactly the header and column lines when no bookings", () => {
    const lines = csv.replace(UTF8_BOM, "").split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it("header line starts with EXTF marker", () => {
    const firstLine = csv.replace(UTF8_BOM, "").split("\r\n")[0];
    expect(firstLine.startsWith('"EXTF"')).toBe(true);
  });

  it("includes consultant and client numbers in header", () => {
    const fields = csv.replace(UTF8_BOM, "").split("\r\n")[0].split(";");
    expect(fields[10]).toBe("1001");
    expect(fields[11]).toBe("1");
  });
});

describe("SKR03 vs SKR04 revenue accounts", () => {
  it("map 19 % revenue to 8400 (SKR03) and 4400 (SKR04)", () => {
    expect(SKR03.revenue19).toBe(8400);
    expect(SKR04.revenue19).toBe(4400);
  });
});

describe("defaultDatevFilename", () => {
  it("embeds local date and HHMM", () => {
    expect(defaultDatevFilename(new Date(2026, 4, 17, 14, 32))).toBe("EXTF_Buchungsstapel_20260517_1432.csv");
    expect(defaultDatevFilename(new Date(2026, 0, 5, 9, 7))).toBe("EXTF_Buchungsstapel_20260105_0907.csv");
  });
});

describe("buildDatevCsv (bookings)", () => {
  const now = new Date(2026, 4, 17, 12, 0, 0);
  const issueDate = Math.floor(new Date(2026, 4, 10).getTime() / 1000);

  function invoiceInput(overrides: Partial<Invoice>, items: Array<Pick<InvoiceItem, "lineTotal" | "vatRate">>) {
    return {
      invoice: {
        number: "RE-2026-0001",
        issueDate,
        isKleinunternehmer: false,
        isReverseCharge: false,
        isCreditNote: false,
        currency: "EUR",
        eurTotalCent: null,
        ...overrides,
      } as Invoice,
      items: items as InvoiceItem[],
      customerName: "Muster GmbH",
      customerVatId: null,
    };
  }

  function bookingRows(csv: string): string[][] {
    return csv
      .replace(UTF8_BOM, "")
      .split("\r\n")
      .filter(Boolean)
      .slice(2)
      .map((line) => line.split(";"));
  }

  const COLUMN_AMOUNT = 0;
  const COLUMN_ACCOUNT = 6;
  const COLUMN_CONTRA_ACCOUNT = 7;

  it("books one row per VAT rate with per-line rounded gross amounts", () => {
    const input = invoiceInput({}, [
      { lineTotal: 10000, vatRate: 19 },
      { lineTotal: 5000, vatRate: 7 },
    ]);
    const rows = bookingRows(buildDatevCsv([input], opts, now));
    expect(rows.map((r) => [r[COLUMN_AMOUNT], r[COLUMN_CONTRA_ACCOUNT]])).toEqual([
      ["53,50", String(SKR03.revenue7)],
      ["119,00", String(SKR03.revenue19)],
    ]);
    expect(rows.every((r) => r[COLUMN_ACCOUNT] === String(SKR03.debitor))).toBe(true);
  });

  it("assigns the foreign-currency rounding residual to the largest VAT group, not the first", () => {
    const input = invoiceInput({ currency: "USD", eurTotalCent: 505 }, [
      { lineTotal: 100, vatRate: 0 },
      { lineTotal: 10, vatRate: 7 },
      { lineTotal: 500, vatRate: 19 },
    ]);
    const rows = bookingRows(buildDatevCsv([input], opts, now));
    expect(rows.map((r) => r[COLUMN_AMOUNT])).toEqual(["0,72", "0,08", "4,25"]);
  });

  describe.each([
    ["SKR03", SKR03],
    ["SKR04", SKR04],
  ])("revenue account of reverse-charge invoices (%s)", (_name, accounts) => {
    const accountOpts = { ...opts, accounts };
    const expectations = [
      ["intra_eu", "goods", accounts.revenueIntraEuGoods],
      ["intra_eu", "services", accounts.revenueIntraEuServices],
      ["third_country", "goods", accounts.revenueThirdCountryGoods],
      ["third_country", "services", accounts.revenueThirdCountryServices],
    ] as const;

    it.each(expectations)("books %s + %s to account %i", (reverseChargeType, supplyKind, expected) => {
      const input = invoiceInput({ isReverseCharge: true, reverseChargeType, supplyKind }, [
        { lineTotal: 10000, vatRate: 19 },
      ]);
      const rows = bookingRows(buildDatevCsv([input], accountOpts, now));
      expect(rows.map((r) => [r[COLUMN_AMOUNT], r[COLUMN_CONTRA_ACCOUNT]])).toEqual([["100,00", String(expected)]]);
    });

    it("books a reverse-charge credit note to the same account as its invoice", () => {
      const input = invoiceInput(
        { isReverseCharge: true, reverseChargeType: "third_country", supplyKind: "goods", isCreditNote: true },
        [{ lineTotal: 10000, vatRate: 19 }],
      );
      const rows = bookingRows(buildDatevCsv([input], accountOpts, now));
      expect(rows.map((r) => r[COLUMN_CONTRA_ACCOUNT])).toEqual([String(accounts.revenueThirdCountryGoods)]);
    });

    it("keeps the domestic 19 % account for a regular invoice with goods", () => {
      const input = invoiceInput({ reverseChargeType: "none", supplyKind: "goods" }, [
        { lineTotal: 10000, vatRate: 19 },
      ]);
      const rows = bookingRows(buildDatevCsv([input], accountOpts, now));
      expect(rows.map((r) => [r[COLUMN_AMOUNT], r[COLUMN_CONTRA_ACCOUNT]])).toEqual([
        ["119,00", String(accounts.revenue19)],
      ]);
    });
  });

  it("uses the documented DATEV standard accounts", () => {
    expect([
      SKR03.revenueIntraEuGoods,
      SKR03.revenueIntraEuServices,
      SKR03.revenueThirdCountryGoods,
      SKR03.revenueThirdCountryServices,
      SKR04.revenueIntraEuGoods,
      SKR04.revenueIntraEuServices,
      SKR04.revenueThirdCountryGoods,
      SKR04.revenueThirdCountryServices,
    ]).toEqual([8125, 8336, 8120, 8338, 4125, 4336, 4120, 4338]);
  });

  const COLUMN_SOLL_HABEN = 1;

  it("books a credit line on its own VAT rate with flipped Soll/Haben", () => {
    const input = invoiceInput({}, [
      { lineTotal: 10000, vatRate: 19 },
      { lineTotal: -2000, vatRate: 7 },
    ]);
    const rows = bookingRows(buildDatevCsv([input], opts, now));
    expect(rows.map((r) => [r[COLUMN_AMOUNT], r[COLUMN_SOLL_HABEN]])).toEqual([
      ["21,40", '"H"'],
      ["119,00", '"S"'],
    ]);
  });

  it("books a positive group of a credit note as Haben and its negative group as Soll", () => {
    const input = invoiceInput({ isCreditNote: true }, [
      { lineTotal: 10000, vatRate: 19 },
      { lineTotal: -2000, vatRate: 7 },
    ]);
    const rows = bookingRows(buildDatevCsv([input], opts, now));
    expect(rows.map((r) => r[COLUMN_SOLL_HABEN])).toEqual(['"S"', '"H"']);
  });

  it("books a foreign-currency credit note (negative eurTotalCent, positive items) as Haben", () => {
    const input = invoiceInput({ isCreditNote: true, currency: "USD", eurTotalCent: -11000 }, [
      { lineTotal: 10000, vatRate: 19 },
    ]);
    const rows = bookingRows(buildDatevCsv([input], opts, now));
    expect(rows.map((r) => [r[COLUMN_AMOUNT], r[COLUMN_SOLL_HABEN]])).toEqual([["110,00", '"H"']]);
  });

  it("keeps the direction of a negative group on a foreign-currency credit note", () => {
    const input = invoiceInput({ isCreditNote: true, currency: "USD", eurTotalCent: -9760 }, [
      { lineTotal: 10000, vatRate: 19 },
      { lineTotal: -2000, vatRate: 7 },
    ]);
    const rows = bookingRows(buildDatevCsv([input], opts, now));
    expect(rows.map((r) => [r[COLUMN_AMOUNT], r[COLUMN_SOLL_HABEN]])).toEqual([
      ["21,40", '"S"'],
      ["119,00", '"H"'],
    ]);
  });

  it("flips a negative expense group against the Soll/Haben of its document", () => {
    const expense = {
      expense: {
        number: "ER-1",
        internalNumber: "EX-2026-0001",
        issueDate,
        isReverseCharge: false,
        status: "open",
      },
      items: [
        { lineTotal: 10000, vatRate: 19, datevAccount: null },
        { lineTotal: -1000, vatRate: 7, datevAccount: null },
      ],
      vendorName: "Lieferant",
      vendorVatId: null,
    } as never;
    const rows = bookingRows(buildDatevCsv({ expenses: [expense] }, opts, now));
    expect(rows.map((r) => [r[COLUMN_AMOUNT], r[COLUMN_SOLL_HABEN]])).toEqual([
      ["10,70", '"H"'],
      ["119,00", '"S"'],
    ]);
  });
});

describe("datevRangeError", () => {
  const wjBeginn = new Date(2026, 0, 1);

  it("accepts a range inside the Wirtschaftsjahr", () => {
    expect(
      datevRangeError({ wjBeginn, dateFrom: new Date(2026, 0, 1), dateTo: new Date(2026, 11, 31, 23, 59, 59) }),
    ).toBeNull();
  });

  it("rejects a range running into the next year", () => {
    expect(
      datevRangeError({ wjBeginn, dateFrom: new Date(2026, 10, 1), dateTo: new Date(2027, 0, 15) }),
    ).toContain("mehr als ein Wirtschaftsjahr");
  });

  it("rejects a range starting before the Wirtschaftsjahr", () => {
    expect(
      datevRangeError({ wjBeginn, dateFrom: new Date(2025, 11, 20), dateTo: new Date(2026, 0, 15) }),
    ).not.toBeNull();
  });

  it("makes buildDatevCsv refuse a two-year range", () => {
    const twoYears = { ...opts, dateTo: new Date(2027, 2, 31) };
    expect(() => buildDatevCsv([], twoYears)).toThrow("Wirtschaftsjahr");
  });
});
