import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/db/client", () => ({ select: vi.fn() }));

import { cashBasisNetByRate, type CashBasisRow } from "./ustva-cash";

function row(overrides: Partial<CashBasisRow>): CashBasisRow {
  return {
    invoice_id: 1,
    is_credit_note: 0,
    total: 11_900,
    currency: "EUR",
    eur_total_cent: null,
    paid_before: 0,
    paid_through: 0,
    vat_rate: 19,
    net: 10_000,
    ...overrides,
  };
}

/** Recognised net per rate for an invoice whose cumulative payments move from `before` to `through`. */
function recognised(groups: Partial<CashBasisRow>[], before: number, through: number) {
  return cashBasisNetByRate(
    groups.map((g) => row({ ...g, paid_before: before, paid_through: through })),
  );
}

describe("cashBasisNetByRate", () => {
  it("recognises the full net when the invoice is paid in full within the period", () => {
    expect(recognised([{}], 0, 11_900).get(19)).toBe(10_000);
  });

  it("splits a partial payment across the quarter boundary into both periods", () => {
    const q1 = recognised([{}], 0, 5_950);
    const q2 = recognised([{}], 5_950, 11_900);

    expect(q1.get(19)).toBe(5_000);
    expect(q2.get(19)).toBe(5_000);
  });

  it("adds up to exactly the invoice net across uneven partial payments", () => {
    const groups = [
      { vat_rate: 19, net: 3_333 },
      { vat_rate: 7, net: 1_001 },
    ];
    const gross = 3_333 + 633 + 1_001 + 70;
    const cumulativePaid = [0, 1_679, 3_001, gross];

    let net19 = 0;
    let net7 = 0;
    for (let i = 1; i < cumulativePaid.length; i++) {
      const period = recognised(
        groups.map((g) => ({ ...g, total: gross })),
        cumulativePaid[i - 1],
        cumulativePaid[i],
      );
      net19 += period.get(19)!;
      net7 += period.get(7)!;
    }

    expect(net19).toBe(3_333);
    expect(net7).toBe(1_001);
  });

  it("gives the rounding residual to the group with the largest net", () => {
    const groups = [
      { vat_rate: 7, net: 100, total: 464 },
      { vat_rate: 19, net: 300, total: 464 },
    ];

    const period = recognised(groups, 0, 2);

    expect(period.get(19)).toBe(1);
    expect(period.get(7)).toBe(1);
  });

  it("converts foreign-currency payments via the frozen EUR total", () => {
    const usd = { currency: "USD", total: 11_900, eur_total_cent: 11_000 };

    expect(recognised([usd], 0, 11_900).get(19)).toBe(9_244);
    expect(recognised([usd], 0, 5_950).get(19)).toBe(4_622);
  });

  it("counts the refund on a credit note negative", () => {
    const creditNote = { is_credit_note: 1, total: -11_900, eur_total_cent: null };

    expect(recognised([creditNote], 0, 11_900).get(19)).toBe(-10_000);
  });

  it("converts foreign-currency credit-note refunds with the absolute EUR total", () => {
    const creditNote = { is_credit_note: 1, currency: "USD", total: -11_900, eur_total_cent: -11_000 };

    expect(recognised([creditNote], 0, 11_900).get(19)).toBe(-9_244);
  });

  it("caps overpayments at the invoice's gross total", () => {
    expect(recognised([{}], 0, 12_500).get(19)).toBe(10_000);
    expect(recognised([{}], 11_900, 12_500).get(19)).toBe(0);
  });

  it("sums several invoices per rate", () => {
    const rows = [
      row({ invoice_id: 1, paid_through: 11_900 }),
      row({ invoice_id: 2, vat_rate: 7, net: 2_000, total: 2_140, paid_through: 2_140 }),
      row({ invoice_id: 3, paid_through: 11_900 }),
    ];

    const netByRate = cashBasisNetByRate(rows);

    expect(netByRate.get(19)).toBe(20_000);
    expect(netByRate.get(7)).toBe(2_000);
  });
});
