import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/db/client", () => ({ select: vi.fn() }));

import { select } from "$lib/db/client";
import { UTF8_BOM } from "$lib/utils/csv";
import {
  buildUstvaReport,
  convertGroupsToEur,
  formatUstvaAmount,
  sumOutgoingNet,
  sumReverseChargePurchases,
  truncateToWholeEuros,
  ustvaToCsv,
  VAT_ACCOUNTING_LABELS,
  type InvoiceGroupRow,
  type ReverseChargePurchaseRow,
  type UstvaReport,
  type VatGroupRow,
} from "./ustva";
import type { CashBasisRow } from "./ustva-cash";

function group(overrides: Partial<VatGroupRow>): VatGroupRow {
  return {
    vat_rate: 19,
    is_credit_note: 0,
    reverse_charge_type: null,
    supply_kind: "goods",
    net: 0,
    ...overrides,
  };
}

describe("sumOutgoingNet", () => {
  it("sorts net revenue into the 19 %, 7 % and intra-EU buckets", () => {
    const sums = sumOutgoingNet([
      group({ vat_rate: 19, net: 10_000 }),
      group({ vat_rate: 7, net: 5_000 }),
      group({ vat_rate: 0, reverse_charge_type: "intra_eu", net: 2_000 }),
    ]);
    expect(sums).toEqual({
      net19: 10_000,
      net7: 5_000,
      netIntraEuGoods: 2_000,
      netIntraEuServices: 0,
      netExportGoods: 0,
      netThirdCountryServices: 0,
    });
  });

  it("subtracts credit notes", () => {
    const sums = sumOutgoingNet([
      group({ vat_rate: 19, net: 10_000 }),
      group({ vat_rate: 19, is_credit_note: 1, net: 4_000 }),
    ]);
    expect(sums.net19).toBe(6_000);
  });

  it("puts intra-EU goods into Kennzahl 41 and intra-EU services into Kennzahl 21", () => {
    const sums = sumOutgoingNet([
      group({ vat_rate: 0, reverse_charge_type: "intra_eu", supply_kind: "goods", net: 2_000 }),
      group({ vat_rate: 0, reverse_charge_type: "intra_eu", supply_kind: "services", net: 700 }),
      group({
        vat_rate: 0,
        reverse_charge_type: "intra_eu",
        supply_kind: "services",
        is_credit_note: 1,
        net: 200,
      }),
    ]);
    expect(sums.netIntraEuGoods).toBe(2_000);
    expect(sums.netIntraEuServices).toBe(500);
  });

  it("puts third-country goods into Kennzahl 43 and third-country services into Kennzahl 45", () => {
    const sums = sumOutgoingNet([
      group({ vat_rate: 0, reverse_charge_type: "third_country", supply_kind: "goods", net: 3_000 }),
      group({ vat_rate: 0, reverse_charge_type: "third_country", supply_kind: "services", net: 900 }),
    ]);
    expect(sums.netExportGoods).toBe(3_000);
    expect(sums.netThirdCountryServices).toBe(900);
    expect(sums.net19).toBe(0);
  });

  it("ignores tax-free domestic groups (Kleinunternehmer)", () => {
    const sums = sumOutgoingNet([group({ vat_rate: 0, net: 1_000 })]);
    expect(Object.values(sums).every((v) => v === 0)).toBe(true);
  });
});

function invoiceGroup(overrides: Partial<InvoiceGroupRow>): InvoiceGroupRow {
  return {
    ...group({}),
    invoice_id: 1,
    total: 11_900,
    currency: "EUR",
    eur_total_cent: null,
    net: 10_000,
    ...overrides,
  };
}

/** Outgoing Kennzahlen buckets of the issued invoices, as the Soll-Versteuerung path builds them. */
function accrualNet(rows: InvoiceGroupRow[]) {
  return sumOutgoingNet(convertGroupsToEur(rows));
}

describe("convertGroupsToEur (Soll-Versteuerung)", () => {
  const usd = { currency: "USD", total: 11_900, eur_total_cent: 11_000 };

  it("converts a foreign-currency invoice to EUR via its frozen EUR total", () => {
    expect(accrualNet([invoiceGroup(usd)]).net19).toBe(9_244);
  });

  it("splits mixed VAT rates of one foreign invoice so they add up to its EUR net", () => {
    const gross = 3_333 + 633 + 1_001 + 70;
    const invoice = { currency: "USD", total: gross, eur_total_cent: 4_500 };

    const sums = accrualNet([
      invoiceGroup({ ...invoice, vat_rate: 19, net: 3_333 }),
      invoiceGroup({ ...invoice, vat_rate: 7, net: 1_001 }),
    ]);

    expect(sums.net19).toBe(2_978);
    expect(sums.net7).toBe(894);
    expect(sums.net19 + sums.net7).toBe(Math.round((4_334 * 4_500) / gross));
  });

  it("gives the rounding residual to the group with the largest net", () => {
    const invoice = { currency: "USD", total: 226, eur_total_cent: 114 };

    const sums = accrualNet([
      invoiceGroup({ ...invoice, vat_rate: 19, net: 100 }),
      invoiceGroup({ ...invoice, vat_rate: 7, net: 100 }),
    ]);

    expect(sums.net19).toBe(50);
    expect(sums.net7).toBe(51);
  });

  it("counts a foreign-currency credit note negative in EUR", () => {
    const creditNote = invoiceGroup({ ...usd, is_credit_note: 1, total: -11_900, eur_total_cent: -11_000 });

    expect(accrualNet([creditNote]).net19).toBe(-9_244);
  });

  it("keeps each foreign invoice's conversion separate", () => {
    const sums = accrualNet([
      invoiceGroup({ ...usd, invoice_id: 1 }),
      invoiceGroup({ currency: "USD", invoice_id: 2, total: 5_950, eur_total_cent: 5_000, net: 5_000 }),
    ]);

    expect(sums.net19).toBe(9_244 + 4_202);
  });

  it("leaves EUR invoices unchanged, whatever eur_total_cent holds", () => {
    const sums = accrualNet([
      invoiceGroup({ invoice_id: 1, net: 10_000 }),
      invoiceGroup({ invoice_id: 2, net: 3_000, eur_total_cent: 1 }),
      invoiceGroup({ invoice_id: 3, net: 500, currency: null }),
      invoiceGroup({ invoice_id: 4, vat_rate: 7, net: 2_000 }),
    ]);

    expect(sums.net19).toBe(13_500);
    expect(sums.net7).toBe(2_000);
  });

  it("leaves a foreign invoice without a frozen EUR total unchanged", () => {
    expect(accrualNet([invoiceGroup({ currency: "USD", eur_total_cent: null })]).net19).toBe(10_000);
  });

  it("converts reverse-charge invoices too", () => {
    const sums = accrualNet([
      invoiceGroup({
        ...usd,
        vat_rate: 0,
        reverse_charge_type: "third_country",
        supply_kind: "services",
        total: 10_000,
        net: 10_000,
        eur_total_cent: 9_000,
      }),
    ]);

    expect(sums.netThirdCountryServices).toBe(9_000);
  });
});

describe("sumReverseChargePurchases", () => {
  it("splits purchases by the supplier's seat", () => {
    expect(
      sumReverseChargePurchases([
        { reverse_charge_type: "intra_eu", net: 4_000 },
        { reverse_charge_type: "third_country", net: 1_500 },
      ]),
    ).toEqual({ netIntraEu: 4_000, netThirdCountry: 1_500 });
  });

  it("ignores rows without a reverse-charge type", () => {
    expect(sumReverseChargePurchases([{ reverse_charge_type: "none", net: 900 }])).toEqual({
      netIntraEu: 0,
      netThirdCountry: 0,
    });
  });
});

describe("buildUstvaReport", () => {
  const purchases: ReverseChargePurchaseRow[] = [
    { reverse_charge_type: "intra_eu", net: 4_000 },
    { reverse_charge_type: "third_country", net: 1_500 },
  ];
  const issuedInQuarter: InvoiceGroupRow[] = [
    invoiceGroup({ invoice_id: 1, vat_rate: 19, net: 10_000 }),
    invoiceGroup({
      invoice_id: 2,
      vat_rate: 0,
      reverse_charge_type: "intra_eu",
      supply_kind: "services",
      net: 800,
    }),
  ];
  const paidInQuarter: CashBasisRow[] = [
    {
      invoice_id: 7,
      is_credit_note: 0,
      total: 2_380,
      currency: "EUR",
      eur_total_cent: null,
      paid_before: 0,
      paid_through: 1_190,
      vat_rate: 19,
      net: 2_000,
    },
  ];

  function mockDb(issued: InvoiceGroupRow[] = issuedInQuarter) {
    vi.mocked(select).mockImplementation(async (sql: string) => {
      if (sql.includes("GROUP BY e.reverse_charge_type")) return purchases as never;
      if (sql.includes("WITH paid AS")) return paidInQuarter as never;
      if (sql.includes("GROUP BY i.id, ii.vat_rate")) return issued as never;
      return [] as never;
    });
  }

  function amountsByKz(report: UstvaReport): Record<string, number> {
    return Object.fromEntries(report.rows.map((r) => [r.kz, r.amount]));
  }

  it("reports §13b purchases in Kennzahl 46 (EU) and 84 (third country), never in 21", async () => {
    vi.mocked(select).mockImplementation(async (sql: string) => {
      if (sql.includes("GROUP BY e.reverse_charge_type")) return purchases as never;
      return [] as never;
    });

    const amounts = amountsByKz(await buildUstvaReport(2026, 1, "accrual"));

    expect(amounts["46"]).toBe(4_000);
    expect(amounts["84"]).toBe(1_500);
    expect(amounts["21"]).toBe(0);
  });

  it("takes Kennzahl 81 from the issue date under Soll-Versteuerung", async () => {
    mockDb();

    const report = await buildUstvaReport(2026, 1, "accrual");

    expect(report.vatAccounting).toBe("accrual");
    expect(amountsByKz(report)["81"]).toBe(10_000);
  });

  it("reports a foreign-currency invoice in EUR under Soll-Versteuerung", async () => {
    mockDb([
      ...issuedInQuarter,
      invoiceGroup({ invoice_id: 3, currency: "USD", total: 11_900, eur_total_cent: 11_000 }),
    ]);

    const report = await buildUstvaReport(2026, 1, "accrual");

    expect(amountsByKz(report)["81"]).toBe(19_200);
  });

  it("truncates every Bemessungsgrundlage to whole euros but keeps cents on the Vorsteuer", async () => {
    vi.mocked(select).mockImplementation(async (sql: string) => {
      if (sql.includes("GROUP BY e.reverse_charge_type"))
        return [{ reverse_charge_type: "intra_eu", net: 4_099 }] as never;
      if (sql.includes("GROUP BY i.id, ii.vat_rate"))
        return [invoiceGroup({ invoice_id: 1, vat_rate: 19, net: 10_099 })] as never;
      if (sql.includes("SUM(e.vat_amount)")) return [{ vat: 1_999 }] as never;
      return [] as never;
    });

    const report = await buildUstvaReport(2026, 1, "accrual");
    const amounts = amountsByKz(report);

    expect(amounts["81"]).toBe(10_000);
    expect(amounts["46"]).toBe(4_000);
    expect(amounts["66"]).toBe(1_999);
    expect(report.rows.filter((r) => r.wholeEuros).map((r) => r.kz)).toEqual([
      "81", "86", "41", "21", "43", "45", "46", "84",
    ]);
    expect(report.rows.find((r) => r.kz === "66")?.wholeEuros).toBe(false);
  });

  it("takes Kennzahl 66 from the stored expense VAT instead of recomputing it with SQL ROUND", async () => {
    mockDb();

    await buildUstvaReport(2026, 1, "accrual");

    const vatSql = vi
      .mocked(select)
      .mock.calls.map(([sql]) => sql)
      .find((sql) => sql.includes("e.vat_amount"));
    expect(vatSql).toBeDefined();
    expect(vatSql).not.toContain("ROUND(");
  });

  it("takes Kennzahl 81 from payments under Ist-Versteuerung", async () => {
    mockDb();

    const report = await buildUstvaReport(2026, 1, "cash");

    expect(report.vatAccounting).toBe("cash");
    expect(amountsByKz(report)["81"]).toBe(1_000);
    expect(report.rows.find((r) => r.kz === "81")?.computedFrom).toContain("Ist-Versteuerung");
  });

  it("keeps Kennzahl 21, 46, 84 by invoice date under Ist-Versteuerung", async () => {
    mockDb();

    const amounts = amountsByKz(await buildUstvaReport(2026, 1, "cash"));

    expect(amounts["21"]).toBe(800);
    expect(amounts["46"]).toBe(4_000);
    expect(amounts["84"]).toBe(1_500);
  });
});

describe("VAT_ACCOUNTING_LABELS", () => {
  it("names the applied method for both settings", () => {
    expect(VAT_ACCOUNTING_LABELS.accrual).toBe("Soll-Versteuerung (nach Rechnungsdatum)");
    expect(VAT_ACCOUNTING_LABELS.cash).toBe("Ist-Versteuerung (nach Zahlungseingang, § 20 UStG)");
  });
});

describe("ustvaToCsv", () => {
  const report: UstvaReport = {
    year: 2026,
    quarter: 1,
    dateFrom: 0,
    dateTo: 0,
    vatAccounting: "accrual",
    rows: [
      { kz: "81", label: "Leistungen; 19 %", amount: -123_400, wholeEuros: true, computedFrom: "Stornos negativ." },
      { kz: "66", label: "Vorsteuer", amount: 4_567, wholeEuros: false, computedFrom: "Eingang." },
    ],
  };

  it("emits BOM, header, German decimals and quotes fields containing the delimiter", () => {
    expect(ustvaToCsv(report)).toBe(
      `${UTF8_BOM}Kennzahl;Beschreibung;Betrag (EUR);Berechnet aus\r\n` +
        `81;"Leistungen; 19 %";-1234;Stornos negativ.\r\n` +
        `66;Vorsteuer;45,67;Eingang.\r\n`,
    );
  });
});

describe("truncateToWholeEuros", () => {
  it.each([
    [12_399, 12_300],
    [12_300, 12_300],
    [99, 0],
    [-99, 0],
    [-12_399, -12_300],
    [0, 0],
  ])("%i cent -> %i cent", (cents, expected) => {
    expect(truncateToWholeEuros(cents)).toBe(expected);
  });
});

describe("formatUstvaAmount", () => {
  const row = { kz: "81", label: "", computedFrom: "" };

  it("shows whole euros without cents for Bemessungsgrundlagen", () => {
    expect(formatUstvaAmount({ ...row, amount: 123_400, wholeEuros: true })).toMatch(/^1\.234\s*€$/);
  });

  it("shows euro and cent for tax amounts", () => {
    expect(formatUstvaAmount({ ...row, amount: 123_456, wholeEuros: false })).toMatch(/^1\.234,56\s*€$/);
  });
});
