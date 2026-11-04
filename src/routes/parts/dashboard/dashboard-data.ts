import type { Period } from "$lib/dashboard/period";
import {
  cashFlowForecast30d,
  loadFollowUps,
  loadKpis,
  monthlyRevenueInPeriod,
  oldestOverdue,
  topCustomersInPeriod,
  type CashFlowForecast,
  type FollowUpItem,
  type Kpis,
  type MonthPoint,
  type OldestOverdue,
  type TopCustomerRow,
} from "$lib/dashboard/queries";
import { listCustomers } from "$lib/db/queries";
import { expireDueOffers, openOffersStats } from "$lib/db/offers";
import { dueRecurring, type RecurringListRow } from "$lib/db/recurring";
import type { FollowUpGroup } from "$lib/dashboard/follow-up";

const TOP_CUSTOMER_COUNT = 5;

export type OfferStats = {
  count: number;
  total: number;
  unconvertedCount: number;
  expiringSoonCount: number;
};

export type DashboardData = {
  customerCount: number;
  kpis: Kpis;
  monthlyRevenue: MonthPoint[];
  topCustomers: TopCustomerRow[];
  receivables: OldestOverdue;
  followUps: FollowUpItem[];
  offerStats: OfferStats;
  dueTemplates: RecurringListRow[];
  cashFlow: CashFlowForecast;
};

export async function loadDashboardData(period: Period): Promise<DashboardData> {
  await expireDueOffers();
  const [
    customers,
    kpis,
    monthlyRevenue,
    topCustomers,
    receivables,
    followUps,
    offerStats,
    dueTemplates,
    cashFlow,
  ] = await Promise.all([
    listCustomers(),
    loadKpis(period),
    monthlyRevenueInPeriod(period),
    topCustomersInPeriod(period, TOP_CUSTOMER_COUNT),
    oldestOverdue(),
    loadFollowUps(),
    openOffersStats(),
    dueRecurring(),
    cashFlowForecast30d(),
  ]);
  return {
    customerCount: customers.length,
    kpis,
    monthlyRevenue,
    topCustomers,
    receivables,
    followUps,
    offerStats,
    dueTemplates,
    cashFlow,
  };
}

export function followUpsInGroup(items: FollowUpItem[], group: FollowUpGroup): FollowUpItem[] {
  return items.filter((item) => item.group === group);
}
