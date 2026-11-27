<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { push } from "svelte-spa-router";
  import { Button, DropdownItem, DropdownMenu, MoreActionsTrigger, PageHeader, toast } from "$lib/ui";
  import { Plus, UserPlus } from "$lib/brand-icons";
  import PeriodSwitcher from "$lib/components/PeriodSwitcher.svelte";
  import { overdueOf } from "$lib/dashboard/age-buckets";
  import { isRunning, loadDefaultPeriod, type Period } from "$lib/dashboard/period";
  import { computeTaxRücklage, type TaxRücklageResult } from "$lib/dashboard/tax";
  import { buildSetupChecklist, isSetupComplete } from "$lib/dashboard/setup-checklist";
  import { isSandboxActive } from "$lib/db/client";
  import { getInvoiceYears } from "$lib/db/invoices";
  import { loadSettings } from "$lib/db/queries";
  import { missingCompanyData } from "$lib/utils/company-completeness";
  import { nowUnix } from "$lib/utils/date";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import CompanyDataBanner from "./parts/dashboard/CompanyDataBanner.svelte";
  import ExpectedPaymentsCard from "./parts/dashboard/ExpectedPaymentsCard.svelte";
  import IncomeExpensesCard from "./parts/dashboard/IncomeExpensesCard.svelte";
  import OverviewFacts from "./parts/dashboard/OverviewFacts.svelte";
  import ProfitCard from "./parts/dashboard/ProfitCard.svelte";
  import ReceivablesCard from "./parts/dashboard/ReceivablesCard.svelte";
  import SandboxBanner from "./parts/dashboard/SandboxBanner.svelte";
  import SetupChecklist from "./parts/dashboard/SetupChecklist.svelte";
  import TaxReserveCard from "./parts/dashboard/TaxReserveCard.svelte";
  import TodoList from "./parts/dashboard/TodoList.svelte";
  import TopCustomersCard from "./parts/dashboard/TopCustomersCard.svelte";
  import { customerShares, expectedColumns, incomeMonths } from "./parts/dashboard/chart-data";
  import {
    loadOverviewData,
    loadPeriodData,
    type OverviewData,
    type PeriodData,
  } from "./parts/dashboard/dashboard-data";
  import { buildTodoItems } from "./parts/dashboard/todo";
  import { taxYearOfPeriod } from "./parts/reports/tax-years";

  let period = $state<Period>(loadDefaultPeriod());
  let sandbox = $state(false);

  const today = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // What needs doing does not depend on the period, so a period switch leaves it alone.
  const overview = createQueryState<OverviewData | null>(null, loadOverviewData);
  const periodData = createQueryState<PeriodData | null>(null, () => loadPeriodData(period));
  // Income tax is assessed per year, so month/quarter periods use the year they fall into.
  const taxReserve = createQueryState<TaxRücklageResult | null>(null, () =>
    computeTaxRücklage(taxYearOfPeriod(period)),
  );

  // Independent of the period: it describes whether the installation is ready to issue documents.
  const setup = createQueryState<{ missingCompany: string[]; hasInvoices: boolean } | null>(
    null,
    async () => {
      const [settings, invoiceYears] = await Promise.all([loadSettings(), getInvoiceYears()]);
      return { missingCompany: missingCompanyData(settings), hasInvoices: invoiceYears.length > 0 };
    },
  );

  $effect(() => {
    overview.reload();
    setup.reload();
  });

  $effect(() => {
    periodData.reload();
    taxReserve.reload();
  });

  $effect(() => {
    isSandboxActive()
      .then((active) => (sandbox = active))
      .catch((e) => toast.error("Sandbox-Status unbekannt", errorMessage(e)));
  });

  const now = nowUnix();
  const overviewData = $derived(overview.data);
  // Figures that depend on the period show a placeholder while the next period loads.
  const settled = $derived(periodData.loading ? null : periodData.data);

  const todoItems = $derived(
    overviewData
      ? buildTodoItems({
          now,
          overdue: overdueOf(overviewData.ageBuckets),
          oldestDaysOverdue: overviewData.receivables.daysOverdue,
          dueTemplates: overviewData.dueTemplates,
          expiringOffersCount: overviewData.offerStats.expiringSoonCount,
          followUps: overviewData.followUps,
          drafts: overviewData.drafts,
          unbilled: overviewData.unbilled,
        })
      : [],
  );
  const months = $derived(
    settled
      ? incomeMonths(settled.revenueByMonth, settled.expensesByMonth, settled.lastYearRevenueByMonth, now)
      : [],
  );
  const shares = $derived(settled ? customerShares(settled.topCustomers, settled.kpis.revenueGross) : []);
  const expected = $derived(overviewData ? expectedColumns(overviewData.expectedPayments) : []);

  const setupSteps = $derived(
    setup.data && overviewData
      ? buildSetupChecklist({
          missingCompany: setup.data.missingCompany,
          customerCount: overviewData.customerCount,
          hasInvoices: setup.data.hasInvoices,
        })
      : null,
  );

</script>

{#if sandbox}
  <SandboxBanner />
{/if}

{#if setup.data && setup.data.missingCompany.length > 0}
  <CompanyDataBanner missing={setup.data.missingCompany} />
{/if}

{#if setupSteps && !isSetupComplete(setupSteps)}
  <SetupChecklist steps={setupSteps} />
{/if}

<PageHeader title="Übersicht" subtitle={today}>
  {#snippet actions()}
    <PeriodSwitcher {period} onChange={(p) => (period = p)} />
    <DropdownMenu>
      {#snippet trigger()}
        <MoreActionsTrigger />
      {/snippet}
      <DropdownItem onSelect={() => push("/customers/new")}>
        <UserPlus />
        Neuer Kunde
      </DropdownItem>
    </DropdownMenu>
    <Button onclick={() => push("/invoices/new")}>
      <Plus />
      Neue Rechnung
    </Button>
  {/snippet}
</PageHeader>

<div class="mb-8 grid grid-cols-1 items-start gap-x-6 gap-y-8 @5xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
  <TodoList items={todoItems} loading={overview.loading && !overviewData} error={overview.error} />
  <ProfitCard
    periodLabel={period.label}
    running={isRunning(period, now)}
    kpis={settled?.kpis ?? null}
    previousKpis={settled?.previousKpis ?? null}
    error={periodData.error}
  />
</div>

<div class="mb-5 grid grid-cols-1 gap-5 @5xl:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
  <IncomeExpensesCard periodLabel={period.label} loading={periodData.loading} error={periodData.error} {months} />
  <ReceivablesCard
    loading={overview.loading && !overviewData}
    error={overview.error}
    buckets={overviewData?.ageBuckets ?? []}
    oldest={overviewData?.receivables ?? { daysOverdue: null, openTotal: 0, openCount: 0 }}
  />
</div>

<div class="mb-8 grid grid-cols-1 gap-5 @3xl:grid-cols-2 @6xl:grid-cols-3">
  <ExpectedPaymentsCard
    loading={overview.loading && !overviewData}
    error={overview.error}
    forecast={overviewData?.cashFlow ?? null}
    columns={expected}
  />
  <TaxReserveCard reserve={taxReserve.data} loading={taxReserve.loading} error={taxReserve.error} />
  <TopCustomersCard
    periodLabel={period.label}
    loading={periodData.loading}
    error={periodData.error}
    {shares}
    customerCount={overviewData?.customerCount ?? null}
  />
</div>

{#if overviewData}
  <OverviewFacts customerCount={overviewData.customerCount} offerStats={overviewData.offerStats} />
{/if}
