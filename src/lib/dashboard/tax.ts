import { select } from "$lib/db/client";
import { loadSettings } from "$lib/db/queries";
import { sumPrepaymentsForYear } from "$lib/db/tax-prepayments";
import { marginalIncomeTax, type FilingStatus, type IncomeTaxResult } from "$lib/tax/income";
import { estimateTradeTax, type TradeTaxResult } from "$lib/tax/trade";
import { nowUnix } from "$lib/utils/date";
import { REVENUE_AMOUNT_SQL, REVENUE_NET_SQL, REVENUE_VAT_SQL } from "./queries";
import { deductibleExpenseCent, deductsExpensesGross } from "./reserve-expenses";
import { resolveTaxYearWindow } from "./tax-year";

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
  daysInYear: number;
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
    /** Ausgaben fließen brutto statt netto in den Gewinn (nur Kleinunternehmer). */
    expensesDeductedGross: boolean;
    usePauschal: boolean;
    pauschalPercent: number;
  };
}

const MAX_PAUSCHAL_PERCENT = 50;

interface YearAggRow {
  revenueNet: number;
  revenueGross: number;
  expenseNet: number;
  expenseGross: number;
  invoiceVat: number;
  expenseVat: number;
}

async function loadYearAgg(yearStart: number, cutoff: number): Promise<YearAggRow> {
  // Storno-Rechnungen sind in `invoices` mit negativem subtotal/vat/total
  // gespeichert (siehe invoices.ts: `sign = isCreditNote ? -1 : 1`), daher
  // nettet ein simples SUM(...) sie korrekt heraus. Fremdwährungsrechnungen
  // fließen über ihren eingefrorenen EUR-Gegenwert ein (wie die Dashboard-KPIs).
  // RC-Eingangsrechnungen (is_reverse_charge=1) ziehen keine Vorsteuer.
  const inv = await select<{
    revenue_net: number;
    revenue_gross: number;
    invoice_vat: number;
  }>(
    `SELECT
       COALESCE(SUM(${REVENUE_NET_SQL}), 0) AS revenue_net,
       COALESCE(SUM(${REVENUE_AMOUNT_SQL}), 0) AS revenue_gross,
       COALESCE(SUM(${REVENUE_VAT_SQL}), 0) AS invoice_vat
     FROM invoices
     WHERE status IN ('sent','partial','paid')
       AND issue_date >= ? AND issue_date <= ?`,
    [yearStart, cutoff],
  );
  const exp = await select<{ expense_net: number; expense_gross: number; expense_vat: number }>(
    `SELECT
       COALESCE(SUM(subtotal), 0) AS expense_net,
       COALESCE(SUM(total), 0) AS expense_gross,
       COALESCE(SUM(CASE WHEN is_reverse_charge = 1 THEN 0 ELSE vat_amount END), 0) AS expense_vat
     FROM expenses
     WHERE status IN ('open','paid')
       AND issue_date >= ? AND issue_date <= ?`,
    [yearStart, cutoff],
  );
  return {
    revenueNet: Math.round(inv[0]?.revenue_net ?? 0),
    revenueGross: Math.round(inv[0]?.revenue_gross ?? 0),
    expenseNet: exp[0]?.expense_net ?? 0,
    expenseGross: exp[0]?.expense_gross ?? 0,
    invoiceVat: Math.round(inv[0]?.invoice_vat ?? 0),
    expenseVat: exp[0]?.expense_vat ?? 0,
  };
}

interface ScenarioInput {
  profitCent: number;
  otherIncomeCent: number;
  ustSchuldCent: number;
  prepaymentsCent: number;
  status: FilingStatus;
  churchRate: number;
  tradeTaxRate: number;
  isFreelancer: boolean;
  year: number;
}

function computeScenario(i: ScenarioInput): TaxScenario {
  const selbstProfitClamped = Math.max(0, i.profitCent);

  const income = marginalIncomeTax(
    selbstProfitClamped,
    i.otherIncomeCent,
    i.status,
    i.churchRate,
    i.year,
  );

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
  const { yearStart, cutoff, daysElapsed, daysInYear } = resolveTaxYearWindow(
    targetYear,
    nowUnix(),
  );

  const agg = await loadYearAgg(yearStart, cutoff);
  const deductibleExpense = deductibleExpenseCent(
    { netCent: agg.expenseNet, grossCent: agg.expenseGross },
    settings,
  );
  const profitYtdCent = agg.revenueNet - deductibleExpense;
  const projectedAnnualProfitCent = Math.floor((profitYtdCent / daysElapsed) * daysInYear);

  const ustSchuldYtdCent = settings.isKleinunternehmer
    ? 0
    : Math.max(0, agg.invoiceVat - agg.expenseVat);

  const prepaymentsCent = await sumPrepaymentsForYear(targetYear);
  const otherIncomeCent = Math.max(0, settings.otherIncomeAnnualCent);
  const isFreelancer = settings.legalForm === "freelancer";

  const baseInput = {
    otherIncomeCent,
    ustSchuldCent: ustSchuldYtdCent,
    prepaymentsCent,
    status: settings.taxFilingStatus,
    churchRate: settings.churchTaxRate,
    tradeTaxRate: settings.tradeTaxRate,
    isFreelancer,
    year: targetYear,
  };

  const ytd = computeScenario({ ...baseInput, profitCent: profitYtdCent });
  const projected = computeScenario({ ...baseInput, profitCent: projectedAnnualProfitCent });

  const pauschalPercent = Math.max(0, Math.min(MAX_PAUSCHAL_PERCENT, settings.pauschalTaxPercent));
  const pauschalReserveCent = Math.max(
    0,
    Math.round((agg.revenueGross * pauschalPercent) / 100),
  );

  return {
    year: targetYear,
    daysElapsed,
    daysInYear,
    profitYtdCent,
    projectedAnnualProfitCent,
    revenueYtdGrossCent: agg.revenueGross,
    ustSchuldYtdCent,
    otherIncomeAnnualCent: otherIncomeCent,
    prepaymentsCent,
    ytd,
    projected,
    pauschalReserveCent,
    pauschalDeltaCent: projected.recommendedReserveCent - pauschalReserveCent,
    flags: {
      isFreelancer,
      isKleinunternehmer: settings.isKleinunternehmer,
      expensesDeductedGross: deductsExpensesGross(settings),
      usePauschal: settings.usePauschalTaxReserve,
      pauschalPercent,
    },
  };
}
