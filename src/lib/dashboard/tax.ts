import { select } from "$lib/db/client";
import { loadSettings } from "$lib/db/queries";
import { sumPrepaymentsForYear } from "$lib/db/tax-prepayments";
import { estimateIncomeTax, type IncomeTaxResult } from "$lib/tax/income";
import { estimateTradeTax, type TradeTaxResult } from "$lib/tax/trade";

export interface TaxScenario {
  /** Selbst-Gewinn auf den hier gerechnet wurde (Cent). */
  profitCent: number;
  /**
   * ESt + Soli + KiSt durch die Selbst-Tätigkeit — als Aufschlag oberhalb
   * der ESt, die schon auf die `otherIncome`-Schicht fällt.
   */
  income: IncomeTaxResult;
  trade: TradeTaxResult;
  /** GewSt nach § 35 EStG-Anrechnung. */
  gewStNetCent: number;
  /** Summe aller Steuer-Lasten (Detail-Berechnung). */
  totalTaxBurdenCent: number;
  /** Detail-Rücklage = totalTaxBurden − Vorauszahlungen, unten geclamped. */
  recommendedReserveCent: number;
}

export interface TaxRücklageResult {
  year: number;
  daysElapsed: number;
  profitYtdCent: number;
  projectedAnnualProfitCent: number;
  /** Umsatz YTD brutto (Cent) — Basis für den Pauschal-Modus. */
  revenueYtdGrossCent: number;
  /** USt-Schuld YTD (Cent). 0 bei Kleinunternehmer. */
  ustSchuldYtdCent: number;
  /** Sonstige Einkünfte/Jahr (z. B. Brutto-Lohn aus Anstellung), zvE in Cent. */
  otherIncomeAnnualCent: number;
  prepaymentsCent: number;
  /** „Was wurde bisher ausgelöst?" — gerechnet aus YTD-Gewinn. */
  ytd: TaxScenario;
  /** „Was kommt aufs Jahr zu?" — gerechnet aus linearer Hochrechnung. */
  projected: TaxScenario;
  /** Pauschal-Wert: `revenueYtdGrossCent × pauschal_tax_percent / 100`. */
  pauschalReserveCent: number;
  /** Differenz (Projected − Pauschal). Positiv = Detail höher. */
  pauschalDeltaCent: number;
  flags: {
    isFreelancer: boolean;
    isKleinunternehmer: boolean;
    usePauschal: boolean;
    pauschalPercent: number;
  };
}

interface YearAggRow {
  revenueNet: number;
  revenueGross: number;
  expense: number;
  invoiceVat: number;
  expenseVat: number;
}

async function loadYearAgg(yearStart: number, now: number): Promise<YearAggRow> {
  // Storno-Rechnungen sind in `invoices` mit negativem subtotal/vat/total
  // gespeichert (siehe invoices.ts: `sign = isCreditNote ? -1 : 1`), daher
  // nettet ein simples SUM(...) sie korrekt heraus.
  // RC-Eingangsrechnungen (is_reverse_charge=1) ziehen keine Vorsteuer.
  const inv = await select<{
    revenue_net: number;
    revenue_gross: number;
    invoice_vat: number;
  }>(
    `SELECT
       COALESCE(SUM(subtotal), 0) AS revenue_net,
       COALESCE(SUM(total), 0) AS revenue_gross,
       COALESCE(SUM(vat_amount), 0) AS invoice_vat
     FROM invoices
     WHERE status IN ('sent','partial','paid')
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
    revenueNet: inv[0]?.revenue_net ?? 0,
    revenueGross: inv[0]?.revenue_gross ?? 0,
    expense: exp[0]?.expense ?? 0,
    invoiceVat: inv[0]?.invoice_vat ?? 0,
    expenseVat: exp[0]?.expense_vat ?? 0,
  };
}

interface ScenarioInput {
  profitCent: number;
  otherIncomeCent: number;
  ustSchuldCent: number;
  prepaymentsCent: number;
  status: "single" | "married";
  churchRate: number;
  tradeTaxRate: number;
  isFreelancer: boolean;
  year: number;
}

function computeScenario(i: ScenarioInput): TaxScenario {
  const selbstProfitClamped = Math.max(0, i.profitCent);
  const otherClamped = Math.max(0, i.otherIncomeCent);

  const estTotal = estimateIncomeTax(
    otherClamped + selbstProfitClamped,
    i.status,
    i.churchRate,
    i.year,
  );
  const estOtherAlone = estimateIncomeTax(
    otherClamped,
    i.status,
    i.churchRate,
    i.year,
  );
  const income: IncomeTaxResult = {
    est: Math.max(0, estTotal.est - estOtherAlone.est),
    soli: Math.max(0, estTotal.soli - estOtherAlone.soli),
    kist: Math.max(0, estTotal.kist - estOtherAlone.kist),
    total: 0,
    tarifYear: estTotal.tarifYear,
  };
  income.total = income.est + income.soli + income.kist;

  const trade = estimateTradeTax(selbstProfitClamped, i.tradeTaxRate, i.isFreelancer);
  const gewStNetCent = Math.max(0, trade.tradeTax - trade.estCredit);

  const totalTaxBurdenCent = income.total + gewStNetCent + i.ustSchuldCent;
  const recommendedReserveCent = Math.max(0, totalTaxBurdenCent - i.prepaymentsCent);

  return {
    profitCent: selbstProfitClamped,
    income,
    trade,
    gewStNetCent,
    totalTaxBurdenCent,
    recommendedReserveCent,
  };
}

/**
 * @param year Steuerjahr (Default = aktuelles Kalenderjahr). Aggregiert wird
 *   Jan 1 → 31. Dez des Jahres, capped bei „jetzt" für laufende Jahre.
 *   Vergangene Jahre nehmen das volle Jahr, zukünftige Jahre fallen auf das
 *   aktuelle Datum zurück (zeigt dann nichts).
 */
export async function computeTaxRücklage(year?: number): Promise<TaxRücklageResult> {
  const settings = await loadSettings();
  const targetYear = year ?? new Date().getFullYear();
  const yearStart = Math.floor(new Date(targetYear, 0, 1).getTime() / 1000);
  const yearEnd = Math.floor(new Date(targetYear + 1, 0, 1).getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  // Für vergangene Jahre: volles Jahr. Für laufendes Jahr: bis jetzt.
  const cutoff = Math.min(now, yearEnd);
  const elapsedSeconds = Math.max(86_400, cutoff - yearStart);
  const daysElapsed = Math.min(365, Math.floor(elapsedSeconds / 86_400) + 1);

  const agg = await loadYearAgg(yearStart, cutoff);
  const profitYtdCent = agg.revenueNet - agg.expense;
  const projectedAnnualProfitCent = Math.floor((profitYtdCent / daysElapsed) * 365);

  const ustSchuldYtdCent = settings.isKleinunternehmer
    ? 0
    : Math.max(0, agg.invoiceVat - agg.expenseVat);

  const prepaymentsCent = await sumPrepaymentsForYear(targetYear);
  const otherIncomeCent = Math.max(0, settings.otherIncomeAnnualCent);

  const baseInput = {
    otherIncomeCent,
    ustSchuldCent: ustSchuldYtdCent,
    prepaymentsCent,
    status: settings.taxFilingStatus,
    churchRate: settings.churchTaxRate,
    tradeTaxRate: settings.tradeTaxRate,
    isFreelancer: settings.legalForm === "freelancer",
    year: targetYear,
  };

  const ytd = computeScenario({ ...baseInput, profitCent: profitYtdCent });
  const projected = computeScenario({ ...baseInput, profitCent: projectedAnnualProfitCent });

  const pauschalPercent = Math.max(0, Math.min(50, settings.pauschalTaxPercent));
  const pauschalReserveCent = Math.max(
    0,
    Math.round((agg.revenueGross * pauschalPercent) / 100),
  );
  const pauschalDeltaCent = projected.recommendedReserveCent - pauschalReserveCent;

  return {
    year: targetYear,
    daysElapsed,
    profitYtdCent,
    projectedAnnualProfitCent,
    revenueYtdGrossCent: agg.revenueGross,
    ustSchuldYtdCent,
    otherIncomeAnnualCent: otherIncomeCent,
    prepaymentsCent,
    ytd,
    projected,
    pauschalReserveCent,
    pauschalDeltaCent,
    flags: {
      isFreelancer: settings.legalForm === "freelancer",
      isKleinunternehmer: settings.isKleinunternehmer,
      usePauschal: settings.usePauschalTaxReserve,
      pauschalPercent,
    },
  };
}
