import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import IncomeExpenseChart from "./IncomeExpenseChart.svelte";
import type { IncomeMonth } from "./chart-types";

const LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function monthsOf(firstYear: number, count: number): IncomeMonth[] {
  return Array.from({ length: count }, (_, i) => {
    const year = firstYear + Math.floor(i / 12);
    const month = (i % 12) + 1;
    return {
      key: `${year}-${month}`,
      year,
      month,
      label: LABELS[month - 1],
      title: `${month}/${year}`,
      revenue: 1_000,
      grossRevenue: 1_190,
      expenses: 100,
      lastYearRevenue: 900,
      future: false,
    };
  });
}

const axisTexts = (html: string) => [...html.matchAll(/<text[^>]*class="[^"]*axis[^"]*"[^>]*>([^<]+)<\/text>/g)].map((m) => m[1].trim());

describe("IncomeExpenseChart axis", () => {
  it("names no year within a single calendar year", () => {
    const { body } = render(IncomeExpenseChart, { props: { months: monthsOf(2026, 12), ariaLabel: "Test" } });

    expect(axisTexts(body).filter((text) => /^20\d\d$/.test(text))).toEqual([]);
  });

  it("prints the year under each January once the period spans more than one year", () => {
    const { body } = render(IncomeExpenseChart, { props: { months: monthsOf(2025, 36), ariaLabel: "Test" } });

    expect(axisTexts(body).filter((text) => /^20\d\d$/.test(text))).toEqual(["2025", "2026", "2027"]);
  });

  it("draws the previous-year marker in the reference colour", () => {
    const { body } = render(IncomeExpenseChart, { props: { months: monthsOf(2026, 3), ariaLabel: "Test" } });

    expect(body).toContain('stroke="var(--series-ref)"');
  });
});
