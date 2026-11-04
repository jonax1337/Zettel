import { describe, expect, it } from "vitest";
import fixtureJson from "../../../sidecar/tests/fixtures/invoice-parity.json?raw";
import { computeEurTotalCent } from "./currency";
import { formatInvoiceNumber } from "./invoice-number";
import { defaultPaymentTermsText } from "./payment-terms";
import { computeTotals, type TotalsItem } from "./totals";

type Fixture = {
  totals: {
    name: string;
    items: TotalsItem[];
    isKleinunternehmer: boolean;
    isReverseCharge: boolean;
    expected: { subtotal: number; vatAmount: number; total: number };
  }[];
  invoiceNumbers: { pattern: string; counter: number; date: string; expected: string }[];
  eurTotals: { currency: string; totalCent: number; exchangeRate: string | null; expected: number | null }[];
  paymentTerms: { days: number; expected: string }[];
};

// The CLI (cli/zettel.py) asserts the same file in sidecar/tests/test_cli_parity.py.
const fixture: Fixture = JSON.parse(fixtureJson);

describe("shared invoice parity fixture (app side)", () => {
  it.each(fixture.totals)("totals: $name", ({ items, isKleinunternehmer, isReverseCharge, expected }) => {
    expect(computeTotals(items, { isKleinunternehmer, isReverseCharge })).toEqual(expected);
  });

  it.each(fixture.invoiceNumbers)("number: $pattern #$counter", ({ pattern, counter, date, expected }) => {
    const [year, month, day] = date.split("-").map(Number);
    expect(formatInvoiceNumber(pattern, counter, new Date(year, month - 1, day))).toBe(expected);
  });

  it.each(fixture.eurTotals)(
    "EUR total: $totalCent $currency @ $exchangeRate",
    ({ currency, totalCent, exchangeRate, expected }) => {
      expect(computeEurTotalCent(currency, totalCent, exchangeRate)).toBe(expected);
    },
  );

  it.each(fixture.paymentTerms)("payment terms for $days days", ({ days, expected }) => {
    expect(defaultPaymentTermsText(days)).toBe(expected);
  });
});
