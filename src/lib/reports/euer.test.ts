import { describe, expect, it, vi } from "vitest";
import { periodForYear } from "$lib/dashboard/period";
import { UTF8_BOM } from "$lib/utils/csv";
vi.mock("$lib/db/client", () => ({ select: vi.fn() }));

import {
  composeEuerReport,
  euerToCsv,
  type EuerExpense,
  type EuerInvoice,
  type EuerPayment,
  type EuerReport,
} from "./euer";

const GROSS_19_PERCENT = 11_900;
const NET_19_PERCENT = 10_000;

function at(year: number, month: number, day: number, hour = 12, minute = 0, second = 0): number {
  return Math.floor(new Date(year, month - 1, day, hour, minute, second).getTime() / 1000);
}

function payment(paidAt: number, amountCent: number, eurAmountCent: number | null = null): EuerPayment {
  return { paidAt, amountCent, eurAmountCent };
}

function invoice(overrides: Partial<EuerInvoice> = {}): EuerInvoice {
  return {
    number: "RE-2026-0001",
    isCreditNote: false,
    isKleinunternehmer: false,
    reverseChargeType: "none",
    total: GROSS_19_PERCENT,
    currency: "EUR",
    eurTotalCent: null,
    groups: [{ rate: 19, net: NET_19_PERCENT }],
    payments: [],
    ...overrides,
  };
}

function expense(overrides: Partial<EuerExpense> = {}): EuerExpense {
  return {
    number: "EX-2026-0001",
    currency: "EUR",
    isReverseCharge: false,
    total: 0,
    vatAmount: 0,
    items: [],
    ...overrides,
  };
}

function report(
  year: number,
  input: { invoices?: EuerInvoice[]; expenses?: EuerExpense[]; isKleinunternehmer?: boolean } = {},
): EuerReport {
  const { start, end } = periodForYear(year);
  return composeEuerReport({
    year,
    invoices: input.invoices ?? [],
    expenses: input.expenses ?? [],
    isKleinunternehmer: input.isKleinunternehmer ?? false,
    from: start,
    to: end - 1,
  });
}

function amount(r: EuerReport, kz: string): number | null {
  const line = r.lines.find((l) => l.kz === kz);
  if (!line) throw new Error(`Kz ${kz} missing`);
  return line.amountCent;
}

describe("composeEuerReport income", () => {
  it("counts a payment on the last second of the year in that year only", () => {
    const paid = invoice({ payments: [payment(at(2025, 12, 31, 23, 59, 59), GROSS_19_PERCENT)] });

    expect(amount(report(2025, { invoices: [paid] }), "112")).toBe(NET_19_PERCENT);
    expect(amount(report(2026, { invoices: [paid] }), "112")).toBeNull();
  });

  it("counts a payment on the first second of the year in the new year only", () => {
    const paid = invoice({ payments: [payment(at(2026, 1, 1, 0, 0, 0), GROSS_19_PERCENT)] });

    expect(amount(report(2025, { invoices: [paid] }), "112")).toBeNull();
    expect(amount(report(2026, { invoices: [paid] }), "112")).toBe(NET_19_PERCENT);
  });

  it("splits net and collected VAT of a paid invoice", () => {
    const paid = invoice({ payments: [payment(at(2026, 3, 1), GROSS_19_PERCENT)] });
    const r = report(2026, { invoices: [paid] });

    expect(amount(r, "112")).toBe(10_000);
    expect(amount(r, "140")).toBe(1_900);
    expect(amount(r, "159")).toBe(11_900);
  });

  it("adds a partial payment across two years up to exactly the invoice", () => {
    const split = invoice({
      payments: [payment(at(2025, 12, 20), 5_950), payment(at(2026, 1, 10), 5_950)],
    });

    const in2025 = report(2025, { invoices: [split] });
    const in2026 = report(2026, { invoices: [split] });

    expect(amount(in2025, "112")).toBe(5_000);
    expect(amount(in2026, "112")).toBe(5_000);
    expect(amount(in2025, "140")).toBe(950);
    expect(amount(in2026, "140")).toBe(950);
  });

  it("adds uneven payments over three years up to the exact net and VAT", () => {
    const gross = 3_333 + 633 + 1_001 + 70;
    const uneven = invoice({
      total: gross,
      groups: [
        { rate: 19, net: 3_333 },
        { rate: 7, net: 1_001 },
      ],
      payments: [payment(at(2024, 6, 1), 1_679), payment(at(2025, 6, 1), 1_322), payment(at(2026, 6, 1), gross - 3_001)],
    });

    const years = [2024, 2025, 2026].map((year) => report(year, { invoices: [uneven] }));

    expect(years.reduce((sum, r) => sum + amount(r, "112")!, 0)).toBe(4_334);
    expect(years.reduce((sum, r) => sum + amount(r, "140")!, 0)).toBe(703);
  });

  it("caps an overpayment at the invoice amount", () => {
    const overpaid = invoice({ payments: [payment(at(2026, 3, 1), 15_000)] });
    const r = report(2026, { invoices: [overpaid] });

    expect(amount(r, "112")).toBe(10_000);
    expect(amount(r, "140")).toBe(1_900);
  });

  it("books the refund of a credit note as negative income", () => {
    const creditNote = invoice({
      isCreditNote: true,
      total: -GROSS_19_PERCENT,
      payments: [payment(at(2026, 5, 1), GROSS_19_PERCENT)],
    });
    const r = report(2026, { invoices: [creditNote] });

    expect(amount(r, "112")).toBe(-10_000);
    expect(amount(r, "140")).toBe(-1_900);
    expect(amount(r, "159")).toBe(-11_900);
  });

  it("converts a foreign-currency invoice via its frozen EUR total", () => {
    const usd = invoice({
      currency: "USD",
      eurTotalCent: 11_000,
      payments: [payment(at(2026, 3, 1), GROSS_19_PERCENT)],
    });
    const r = report(2026, { invoices: [usd] });

    expect(amount(r, "112")).toBe(9_244);
    expect(amount(r, "140")).toBe(1_756);
    expect(r.warnings).toEqual([]);
  });

  it("prefers the EUR actually received over the frozen EUR total", () => {
    const usd = invoice({
      currency: "USD",
      eurTotalCent: 11_000,
      payments: [payment(at(2026, 3, 1), GROSS_19_PERCENT, 10_500)],
    });
    const r = report(2026, { invoices: [usd] });

    expect(amount(r, "112")! + amount(r, "140")!).toBe(10_500);
  });

  it("warns about a foreign-currency invoice without a frozen EUR total", () => {
    const usd = invoice({ number: "RE-2026-0042", currency: "USD", payments: [payment(at(2026, 3, 1), GROSS_19_PERCENT)] });

    expect(report(2026, { invoices: [usd] }).warnings).toEqual([
      "1 Rechnung in Fremdwährung ohne EUR-Wert – Beträge prüfen: RE-2026-0042",
    ]);
  });

  it("sorts mixed VAT rates into taxable and tax-free income", () => {
    const mixed = invoice({
      total: 19_250,
      groups: [
        { rate: 19, net: 10_000 },
        { rate: 7, net: 5_000 },
        { rate: 0, net: 2_000 },
      ],
      payments: [payment(at(2026, 3, 1), 19_250)],
    });
    const r = report(2026, { invoices: [mixed] });

    expect(amount(r, "112")).toBe(15_000);
    expect(amount(r, "103")).toBe(2_000);
    expect(amount(r, "140")).toBe(2_250);
  });

  it("books the whole gross of a Kleinunternehmer invoice on Kz 111", () => {
    const small = invoice({
      isKleinunternehmer: true,
      total: 5_000,
      groups: [{ rate: 0, net: 5_000 }],
      payments: [payment(at(2026, 3, 1), 5_000)],
    });
    const r = report(2026, { invoices: [small] });

    expect(amount(r, "111")).toBe(5_000);
    expect(amount(r, "112")).toBeNull();
    expect(amount(r, "103")).toBeNull();
    expect(amount(r, "140")).toBeNull();
  });

  it.each(["intra_eu", "third_country"] as const)("books %s reverse-charge net on Kz 103", (reverseChargeType) => {
    const rc = invoice({
      reverseChargeType,
      total: 8_000,
      groups: [{ rate: 0, net: 8_000 }],
      payments: [payment(at(2026, 3, 1), 8_000)],
    });
    const r = report(2026, { invoices: [rc] });

    expect(amount(r, "103")).toBe(8_000);
    expect(amount(r, "112")).toBeNull();
    expect(amount(r, "140")).toBeNull();
  });
});

describe("composeEuerReport expenses", () => {
  const software = { lineTotal: 10_000, euerKz: "228" };
  const unmapped = { lineTotal: 5_000, euerKz: null };

  it("books net per mapped Kz and the input VAT on Kz 185", () => {
    const r = report(2026, { expenses: [expense({ total: 17_850, vatAmount: 2_850, items: [software, unmapped] })] });

    expect(amount(r, "228")).toBe(10_000);
    expect(amount(r, "183")).toBe(5_000);
    expect(amount(r, "185")).toBe(2_850);
    expect(amount(r, "199")).toBe(17_850);
  });

  it("books items without a mapping on Kz 183", () => {
    const r = report(2026, { expenses: [expense({ total: 5_000, items: [unmapped] })] });

    expect(amount(r, "183")).toBe(5_000);
  });

  it("books Kleinunternehmer expenses gross and without input VAT", () => {
    const gross = expense({ total: 17_850, vatAmount: 2_850, items: [software, unmapped] });
    const r = report(2026, { expenses: [gross], isKleinunternehmer: true });

    expect(amount(r, "228")).toBe(11_900);
    expect(amount(r, "183")).toBe(5_950);
    expect(amount(r, "185")).toBeNull();
    expect(amount(r, "199")).toBe(17_850);
  });

  it("books a reverse-charge purchase net without input VAT", () => {
    const rc = expense({ isReverseCharge: true, total: 11_900, vatAmount: 1_900, items: [software] });

    for (const isKleinunternehmer of [false, true]) {
      const r = report(2026, { expenses: [rc], isKleinunternehmer });
      expect(amount(r, "228")).toBe(10_000);
      expect(amount(r, "185")).toBeNull();
    }
  });

  it("returns foreign-currency expenses as a warning but still counts them", () => {
    const usd = expense({ number: "EX-2026-0007", currency: "USD", total: 5_000, items: [unmapped] });
    const r = report(2026, { expenses: [usd] });

    expect(amount(r, "183")).toBe(5_000);
    expect(r.warnings).toEqual(["1 Ausgabe in Fremdwährung ohne EUR-Kurs – Beträge prüfen: EX-2026-0007"]);
  });
});

describe("composeEuerReport sums and empty lines", () => {
  it("leaves every line empty instead of 0,00 when nothing was paid", () => {
    const r = report(2026);

    expect(r.lines.every((line) => line.amountCent === null)).toBe(true);
    expect(r.surplusCent).toBe(0);
  });

  it("keeps a real zero amount as zero", () => {
    const free = invoice({ total: 0, groups: [{ rate: 19, net: 0 }], payments: [payment(at(2026, 3, 1), 0)] });

    expect(amount(report(2026, { invoices: [free] }), "112")).toBe(0);
  });

  it("sums the filled income and expense lines and reports the surplus", () => {
    const paid = invoice({ payments: [payment(at(2026, 3, 1), GROSS_19_PERCENT)] });
    const bought = expense({ total: 5_950, vatAmount: 950, items: [{ lineTotal: 5_000, euerKz: "229" }] });
    const r = report(2026, { invoices: [paid], expenses: [bought] });

    expect(amount(r, "159")).toBe(11_900);
    expect(amount(r, "199")).toBe(5_950);
    expect(r.surplusCent).toBe(5_950);
  });

  it("never fills the lines Zettel does not record", () => {
    const paid = invoice({ payments: [payment(at(2026, 3, 1), GROSS_19_PERCENT)] });
    const r = report(2026, { invoices: [paid] });

    for (const kz of ["141", "186", "130/131/136"]) expect(amount(r, kz)).toBeNull();
  });
});

describe("composeEuerReport form year", () => {
  it("shows the line numbers of the form for the tax year", () => {
    const line = (r: EuerReport, kz: string) => r.lines.find((l) => l.kz === kz)!.line;

    expect(line(report(2025), "185")).toBe("57");
    expect(line(report(2026), "185")).toBe("58");
    expect(report(2026).formYearExact).toBe(true);
  });

  it("falls back to the nearest known form for other years", () => {
    const r = report(2027);

    expect(r.formYear).toBe(2026);
    expect(r.formYearExact).toBe(false);
    expect(r.lines.find((l) => l.kz === "199")!.line).toBe("76");
  });
});

describe("euerToCsv", () => {
  it("writes a BOM, semicolons, decimal commas and empty cells for empty lines", () => {
    const paid = invoice({ payments: [payment(at(2026, 3, 1), GROSS_19_PERCENT)] });
    const csv = euerToCsv(report(2026, { invoices: [paid] }));

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    expect(csv).toContain("Zeile;Kz;Bezeichnung;Betrag (EUR)\r\n");
    expect(csv).toContain("\r\n15;112;Umsatzsteuerpflichtige Betriebseinnahmen (netto);100,00\r\n");
    expect(csv).toContain("\r\n18;141;Vom Finanzamt erstattete und ggf. verrechnete Umsatzsteuer;\r\n");
    expect(csv).toContain("\r\n32–34;130/131/136;");
    expect(csv.trimEnd().split("\r\n").at(-1)).toBe(
      ";;Überschuss/Fehlbetrag (Summe Betriebseinnahmen − Summe Betriebsausgaben);119,00",
    );
  });

  it("writes negative amounts with a minus sign", () => {
    const creditNote = invoice({
      isCreditNote: true,
      total: -GROSS_19_PERCENT,
      payments: [payment(at(2026, 5, 1), GROSS_19_PERCENT)],
    });

    expect(euerToCsv(report(2026, { invoices: [creditNote] }))).toContain(";-100,00\r\n");
  });
});
