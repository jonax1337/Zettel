import { describe, expect, it } from "vitest";
import type { Component } from "svelte";
import { render } from "svelte/server";
import type { AgeBucket } from "$lib/dashboard/age-buckets";
import type { CashFlowForecast } from "$lib/dashboard/queries";
import ExpectedPaymentsCard from "./ExpectedPaymentsCard.svelte";
import IncomeExpensesCard from "./IncomeExpensesCard.svelte";
import ProfitCard from "./ProfitCard.svelte";
import ReceivablesCard from "./ReceivablesCard.svelte";
import TaxReserveCard from "./TaxReserveCard.svelte";
import TopCustomersCard from "./TopCustomersCard.svelte";

const html = <P extends Record<string, unknown>>(component: Component<P>, props: P) =>
  render(component, { props }).body;

const FAILED = "Konnte nicht geladen werden: Datenbank gesperrt";
const ERROR = "Datenbank gesperrt";

describe("error states", () => {
  it("shows the error in the profit card instead of placeholder figures", () => {
    const body = html(ProfitCard, { periodLabel: "2026", running: true, kpis: null, previousKpis: null, error: ERROR });

    expect(body).toContain(FAILED);
    expect(body).not.toContain("…");
  });

  it("shows the error in the income chart card instead of 'no data'", () => {
    const body = html(IncomeExpensesCard, { periodLabel: "2026", loading: false, error: ERROR, months: [] });

    expect(body).toContain(FAILED);
    expect(body).not.toContain("Keine Daten");
  });

  it("shows the error in the top customers card instead of 'no invoices'", () => {
    const body = html(TopCustomersCard, { periodLabel: "2026", loading: false, error: ERROR, shares: [], customerCount: null });

    expect(body).toContain(FAILED);
    expect(body).not.toContain("Keine Rechnungen");
  });

  it("shows the error in the receivables card instead of 'all paid'", () => {
    const body = html(ReceivablesCard, {
      loading: false,
      error: ERROR,
      buckets: [],
      oldest: { daysOverdue: null, openTotal: 0, openCount: 0 },
    });

    expect(body).toContain(FAILED);
    expect(body).not.toContain("Alles bezahlt");
  });

  it("keeps the tax reserve card in place while it loads and when it fails", () => {
    const loading = html(TaxReserveCard, { reserve: null, loading: true, error: null });
    const failed = html(TaxReserveCard, { reserve: null, loading: false, error: ERROR });

    expect(loading).toContain("Steuer-Rücklage");
    expect(loading).toContain("Lade…");
    expect(failed).toContain("Steuer-Rücklage");
    expect(failed).toContain("Konnte nicht berechnet werden: Datenbank gesperrt");
  });
});

describe("ReceivablesCard", () => {
  const buckets: AgeBucket[] = [{ id: "notDue", count: 1, total: 1_000 }];

  it("links 'Alle ansehen' to the open invoice view", () => {
    const body = html(ReceivablesCard, {
      loading: false,
      error: null,
      buckets,
      oldest: { daysOverdue: -3, openTotal: 1_000, openCount: 1 },
    });

    expect(body).toContain('href="/invoices?view=open"');
  });
});

describe("ExpectedPaymentsCard", () => {
  const forecast: CashFlowForecast = {
    openDue: 308_210,
    openDueCount: 2,
    overdue: 418_975,
    overdueCount: 3,
    recurringEstimate: 77_350,
    recurringCount: 2,
    total: 804_535,
  };

  it("names the overdue amount, the amount due and the estimate", () => {
    const body = html(ExpectedPaymentsCard, { loading: false, error: null, forecast, columns: [] }).replaceAll("\u00a0", " ");

    expect(body).toMatch(/4\.189,75 € überfällig, 3\.082,10 € fällig, ≈ 773,50 € aus 2 Serien geschätzt/);
  });
});
