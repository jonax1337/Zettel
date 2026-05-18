import { select } from "$lib/db/client";
import { loadSettings } from "$lib/db/queries";
import { estimateIncomeTax, type IncomeTaxWithSource } from "$lib/tax/income";
import { estimateTradeTax, type TradeTaxResult } from "$lib/tax/trade";

export interface TaxRücklageInput {
  /**
   * Override für den Rest-Jahresgewinn (für „Was wenn"-Slider in der Detail-
   * Route). Wenn gesetzt: `projectedAnnualProfit = profitYtd + override`.
   * Sonst: lineare Hochrechnung.
   */
  remainingProfitOverrideCent?: number;
}

export interface TaxRücklageResult {
  year: number;
  daysElapsed: number;
  profitYtdCent: number;
  projectedAnnualProfitCent: number;
  /** USt-Schuld YTD (Cent). 0 bei Kleinunternehmer. */
  ustSchuldYtdCent: number;
  /** ESt + Soli + KiSt-Schätzung für den hochgerechneten Jahresgewinn. */
  income: IncomeTaxWithSource;
  /** GewSt-Schätzung. */
  trade: TradeTaxResult;
  /** Summe aller Steuer-Lasten. */
  totalTaxBurdenCent: number;
  prepaymentsCent: number;
  /** Empfohlene Rücklage (untere Schranke 0). */
  recommendedReserveCent: number;
  /** Profil-Echo für UI-Anzeige (Quelle, Kleinunternehmer-Hinweis, etc.). */
  flags: {
    isFreelancer: boolean;
    isKleinunternehmer: boolean;
    estSource: "bmf" | "local";
  };
}

interface YearAggRow {
  revenue: number;
  stornos: number;
  expense: number;
  invoiceVat: number;
  stornoVat: number;
  expenseVat: number;
}

async function loadYearAgg(yearStart: number, now: number): Promise<YearAggRow> {
  // Bewusst nur eine Round-Trip in jede Richtung; Storno trennen wir per
  // is_credit_note. RC-Eingangsrechnungen (is_reverse_charge=1) ziehen keine
  // Vorsteuer, daher gefiltert.
  const inv = await select<{
    revenue: number;
    stornos: number;
    invoice_vat: number;
    storno_vat: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN is_credit_note = 1 THEN 0 ELSE subtotal END), 0) AS revenue,
       COALESCE(SUM(CASE WHEN is_credit_note = 1 THEN subtotal ELSE 0 END), 0) AS stornos,
       COALESCE(SUM(CASE WHEN is_credit_note = 1 THEN 0 ELSE vat_amount END), 0) AS invoice_vat,
       COALESCE(SUM(CASE WHEN is_credit_note = 1 THEN vat_amount ELSE 0 END), 0) AS storno_vat
     FROM invoices
     WHERE status IN ('sent','paid')
       AND issue_date >= ? AND issue_date <= ?`,
    [yearStart, now],
  );
  const exp = await select<{ expense: number; expense_vat: number }>(
    `SELECT
       COALESCE(SUM(subtotal), 0) AS expense,
       COALESCE(SUM(CASE WHEN is_reverse_charge = 1 THEN 0 ELSE vat_amount END), 0) AS expense_vat
     FROM expenses
     WHERE status IN ('open','paid')
       AND issue_date >= ? AND issue_date <= ?`,
    [yearStart, now],
  );
  return {
    revenue: inv[0]?.revenue ?? 0,
    stornos: inv[0]?.stornos ?? 0,
    expense: exp[0]?.expense ?? 0,
    invoiceVat: inv[0]?.invoice_vat ?? 0,
    stornoVat: inv[0]?.storno_vat ?? 0,
    expenseVat: exp[0]?.expense_vat ?? 0,
  };
}

export async function computeTaxRücklage(
  opts?: TaxRücklageInput,
): Promise<TaxRücklageResult> {
  const settings = await loadSettings();
  const year = new Date().getFullYear();
  const yearStart = Math.floor(new Date(year, 0, 1).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const daysElapsed = Math.max(1, Math.floor((now - yearStart) / 86_400) + 1);

  const agg = await loadYearAgg(yearStart, now);
  const profitYtdCent = agg.revenue - agg.stornos - agg.expense;

  const projectedAnnualProfitCent =
    opts?.remainingProfitOverrideCent !== undefined
      ? profitYtdCent + opts.remainingProfitOverrideCent
      : Math.floor((profitYtdCent / daysElapsed) * 365);

  const ustSchuldYtdCent = settings.isKleinunternehmer
    ? 0
    : Math.max(0, agg.invoiceVat - agg.stornoVat - agg.expenseVat);

  const income = await estimateIncomeTax(
    Math.max(0, projectedAnnualProfitCent),
    settings.taxFilingStatus,
    settings.churchTaxRate,
    year,
  );

  const trade = estimateTradeTax(
    Math.max(0, projectedAnnualProfitCent),
    settings.tradeTaxRate,
    settings.legalForm === "freelancer",
  );

  const gewStNetCent = Math.max(0, trade.tradeTax - trade.estCredit);
  const totalTaxBurdenCent = income.total + gewStNetCent + ustSchuldYtdCent;

  const prepaymentsCent =
    settings.estPrepaymentQ1Cent +
    settings.estPrepaymentQ2Cent +
    settings.estPrepaymentQ3Cent +
    settings.estPrepaymentQ4Cent;

  const recommendedReserveCent = Math.max(0, totalTaxBurdenCent - prepaymentsCent);

  return {
    year,
    daysElapsed,
    profitYtdCent,
    projectedAnnualProfitCent,
    ustSchuldYtdCent,
    income,
    trade,
    totalTaxBurdenCent,
    prepaymentsCent,
    recommendedReserveCent,
    flags: {
      isFreelancer: settings.legalForm === "freelancer",
      isKleinunternehmer: settings.isKleinunternehmer,
      estSource: income.source,
    },
  };
}
