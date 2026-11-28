import { comparisonPeriod, oneYearEarlier, type Period } from "$lib/dashboard/period";
import type { AgeBucket } from "$lib/dashboard/age-buckets";
import {
  draftInvoiceSummary,
  expectedPaymentsByWeek,
  monthlyExpensesNet,
  receivablesByAge,
  type DraftSummary,
  type MonthAmount,
} from "$lib/dashboard/overview-queries";
import {
  cashFlowForecast30d,
  loadFollowUps,
  loadKpis,
  monthlyRevenueInPeriod,
  oldestOverdue,
  openInvoiceRows,
  topCustomersInPeriod,
  type CashFlowForecast,
  type FollowUpItem,
  type Kpis,
  type MonthPoint,
  type OldestOverdue,
  type TopCustomerRow,
} from "$lib/dashboard/queries";
import type { ExpectedPayments } from "$lib/dashboard/weeks";
import { listCustomers } from "$lib/db/queries";
import { expireDueOffers, openOffersStats } from "$lib/db/offers";
import { dueRecurring, type RecurringListRow } from "$lib/db/recurring";
import { listTimeEntries } from "$lib/db/time-entries";
import { summarizeEntries } from "$lib/time/summary";
import { nowUnix } from "$lib/utils/date";
import type { UnbilledTime } from "./todo";

const TOP_CUSTOMER_COUNT = 5;

type OfferStats = {
  count: number;
  total: number;
  unconvertedCount: number;
  expiringSoonCount: number;
};

/** Everything that does not depend on the selected period: what needs doing and what is owed. */
export type OverviewData = {
  customerCount: number;
  receivables: OldestOverdue;
  ageBuckets: AgeBucket[];
  followUps: FollowUpItem[];
  offerStats: OfferStats;
  dueTemplates: RecurringListRow[];
  cashFlow: CashFlowForecast;
  expectedPayments: ExpectedPayments;
  drafts: DraftSummary;
  unbilled: UnbilledTime;
};

/** The figures of the selected period and of the same span one year earlier. */
export type PeriodData = {
  kpis: Kpis;
  /** The same span one year earlier, up to the same day while the period is still running. */
  previousKpis: Kpis;
  revenueByMonth: MonthPoint[];
  expensesByMonth: MonthAmount[];
  lastYearRevenueByMonth: MonthPoint[];
  topCustomers: TopCustomerRow[];
};

async function loadUnbilledTime(): Promise<UnbilledTime> {
  const entries = await listTimeEntries({ status: "open" });
  const summary = summarizeEntries(entries);
  // A running timer has no duration yet and is left out of the sums, so it is left out of the count too.
  const projectIds = new Set(entries.filter((e) => e.durationMinutes !== null).map((e) => e.projectId));
  return { minutes: summary.openMinutes, amountCent: summary.openAmountCent, projectCount: projectIds.size };
}

export async function loadOverviewData(): Promise<OverviewData> {
  const now = nowUnix();
  const [, openInvoices] = await Promise.all([expireDueOffers(), openInvoiceRows()]);
  const [
    customers,
    receivables,
    ageBuckets,
    followUps,
    offerStats,
    dueTemplates,
    cashFlow,
    expectedPayments,
    drafts,
    unbilled,
  ] = await Promise.all([
    listCustomers(),
    oldestOverdue(openInvoices),
    receivablesByAge(now, openInvoices),
    loadFollowUps(),
    openOffersStats(),
    dueRecurring(),
    cashFlowForecast30d(),
    expectedPaymentsByWeek(now, openInvoices),
    draftInvoiceSummary(),
    loadUnbilledTime(),
  ]);
  return {
    customerCount: customers.length,
    receivables,
    ageBuckets,
    followUps,
    offerStats,
    dueTemplates,
    cashFlow,
    expectedPayments,
    drafts,
    unbilled,
  };
}

export async function loadPeriodData(period: Period): Promise<PeriodData> {
  const [kpis, previousKpis, revenueByMonth, expensesByMonth, lastYearRevenueByMonth, topCustomers] =
    await Promise.all([
      loadKpis(period),
      loadKpis(comparisonPeriod(period, nowUnix())),
      monthlyRevenueInPeriod(period),
      monthlyExpensesNet(period),
      monthlyRevenueInPeriod(oneYearEarlier(period)),
      topCustomersInPeriod(period, TOP_CUSTOMER_COUNT),
    ]);
  return { kpis, previousKpis, revenueByMonth, expensesByMonth, lastYearRevenueByMonth, topCustomers };
}
