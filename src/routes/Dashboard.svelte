<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Button, Card, CardContent, toast } from "$lib/ui";
  import {
    Users,
    Clock,
    TrendingUp,
    TrendingDown,
    Plus,
    UserPlus,
    FileSignature,
    Scale,
  } from "$lib/brand-icons";
  import PeriodSwitcher from "$lib/components/PeriodSwitcher.svelte";
  import BarChart from "$lib/components/BarChart.svelte";
  import { loadDefaultPeriod, type Period } from "$lib/dashboard/period";
  import type { Kpis } from "$lib/dashboard/queries";
  import { computeTaxRücklage, type TaxRücklageResult } from "$lib/dashboard/tax";
  import { buildSetupChecklist, isSetupComplete } from "$lib/dashboard/setup-checklist";
  import { isSandboxActive } from "$lib/db/client";
  import { getInvoiceYears } from "$lib/db/invoices";
  import { loadSettings } from "$lib/db/queries";
  import { missingCompanyData } from "$lib/utils/company-completeness";
  import { saveFilters } from "$lib/utils/list-filters";
  import { centsToEur } from "$lib/utils/money";
  import { pluralize } from "./parts/entity/format";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import CashFlowCard from "./parts/dashboard/CashFlowCard.svelte";
  import CompanyDataBanner from "./parts/dashboard/CompanyDataBanner.svelte";
  import DueTemplatesSection from "./parts/dashboard/DueTemplatesSection.svelte";
  import FollowUpsCard from "./parts/dashboard/FollowUpsCard.svelte";
  import KpiCard from "./parts/dashboard/KpiCard.svelte";
  import ReceivablesCard from "./parts/dashboard/ReceivablesCard.svelte";
  import SandboxBanner from "./parts/dashboard/SandboxBanner.svelte";
  import SetupChecklist from "./parts/dashboard/SetupChecklist.svelte";
  import TaxReserveCard from "./parts/dashboard/TaxReserveCard.svelte";
  import TopCustomersCard from "./parts/dashboard/TopCustomersCard.svelte";
  import { loadDashboardData, type DashboardData } from "./parts/dashboard/dashboard-data";
  import { taxYearOfPeriod } from "./parts/reports/tax-years";

  let period = $state<Period>(loadDefaultPeriod());
  let sandbox = $state(false);

  const dashboard = createQueryState<DashboardData | null>(null, () => loadDashboardData(period));
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
    dashboard.reload();
    taxReserve.reload();
    setup.reload();
  });

  $effect(() => {
    isSandboxActive()
      .then((active) => (sandbox = active))
      .catch((e) => toast.error("Sandbox-Status unbekannt", String(e)));
  });

  const data = $derived(dashboard.data);
  // Figures that depend on the period show a placeholder while the next period loads.
  const settled = $derived(dashboard.loading ? null : data);
  const kpis = $derived(settled?.kpis ?? null);
  const monthlyBars = $derived(
    (data?.monthlyRevenue ?? []).map((m) => ({
      label: m.label,
      value: m.total,
      sublabel: String(m.year),
    })),
  );
  const formatKpi = (pick: (k: Kpis) => number) => (kpis ? centsToEur(pick(kpis)) : null);

  const setupSteps = $derived(
    setup.data && settled
      ? buildSetupChecklist({
          missingCompany: setup.data.missingCompany,
          customerCount: settled.customerCount,
          hasInvoices: setup.data.hasInvoices,
        })
      : null,
  );

  function openUnpaidInvoices() {
    saveFilters("invoices", { onlyOpen: true });
    push("/invoices");
  }

  // Breakpoints follow the content area (@container in Layout), not the window,
  // because the sidebar eats 240px. Five cards only share one row once each one
  // fits a six-digit amount; in between they split 3 + 2 on a six-column grid.
  const KPI_TOP_ROW = "@2xl:col-span-2 @5xl:col-span-1";
  const KPI_BOTTOM_ROW = "@2xl:col-span-3 @5xl:col-span-1";
  const balanceClass = $derived(
    !kpis || kpis.balance === 0 ? "" : kpis.balance < 0 ? "text-destructive" : "text-success",
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

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Dashboard</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Zeitraum: <span class="font-medium text-foreground">{period.label}</span>
    </p>
  </div>
  <div class="flex flex-wrap items-end gap-3">
    <PeriodSwitcher {period} onChange={(p) => (period = p)} />
    <div class="flex gap-2">
      <Button onclick={() => push("/invoices/new")}>
        <Plus />
        Neue Rechnung
      </Button>
      <Button onclick={() => push("/customers/new")} variant="outline">
        <UserPlus />
        Neuer Kunde
      </Button>
    </div>
  </div>
</header>

{#if dashboard.error}
  <p class="mb-6 text-sm text-destructive">Dashboard konnte nicht geladen werden: {dashboard.error}</p>
{/if}

<div class="grid grid-cols-2 @2xl:grid-cols-6 @5xl:grid-cols-5 gap-4 mb-6 stagger">
  <KpiCard
    class={KPI_TOP_ROW}
    label="Umsatz netto"
    icon={TrendingUp}
    value={formatKpi((k) => k.revenueNet)}
  />
  <KpiCard
    class={KPI_TOP_ROW}
    label="Umsatz brutto"
    icon={TrendingUp}
    value={formatKpi((k) => k.revenueGross)}
  />
  <KpiCard
    class={KPI_TOP_ROW}
    label="Aufwand netto"
    icon={TrendingDown}
    value={formatKpi((k) => k.expenseNet)}
    onclick={() => push("/expenses")}
  />
  <KpiCard
    class={KPI_BOTTOM_ROW}
    label="Saldo"
    icon={Scale}
    value={formatKpi((k) => k.balance)}
    valueClass={balanceClass}
  />
  <KpiCard
    class="col-span-2 {KPI_BOTTOM_ROW}"
    label="Offene Posten"
    icon={Clock}
    value={formatKpi((k) => k.openTotal)}
    iconClass={kpis && kpis.openCount > 0 ? "text-warning" : undefined}
    onclick={openUnpaidInvoices}
  >
    {#snippet caption()}
      {kpis?.openCount ?? 0} {pluralize(kpis?.openCount ?? 0, "Rechnung", "Rechnungen")}
    {/snippet}
  </KpiCard>
</div>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 stagger">
  <KpiCard
    label="Kunden"
    icon={Users}
    value={settled ? String(settled.customerCount) : null}
    onclick={() => push("/customers")}
  />
  <KpiCard
    label="Offene Angebote"
    icon={FileSignature}
    value={settled ? centsToEur(settled.offerStats.total) : null}
    onclick={() => push("/offers")}
  >
    {#snippet caption()}
      {settled?.offerStats.count ?? 0} {pluralize(settled?.offerStats.count ?? 0, "Angebot", "Angebote")}{#if settled && settled.offerStats.expiringSoonCount > 0}
        <span class="text-warning"> · {settled.offerStats.expiringSoonCount} läuft bald ab</span>
      {/if}
    {/snippet}
  </KpiCard>
</div>

<div class="grid grid-cols-1 @4xl:grid-cols-3 gap-4 mb-6">
  <Card class="@4xl:col-span-2">
    <CardContent>
      <div class="mb-3">
        <div class="text-xs text-muted-foreground uppercase tracking-wider">Umsatz pro Monat</div>
        <div class="text-xs text-muted-foreground mt-0.5">{period.label}</div>
      </div>
      {#if dashboard.loading}
        <div class="h-40 grid place-items-center text-sm text-muted-foreground">Lade…</div>
      {:else if monthlyBars.length === 0}
        <div class="h-40 grid place-items-center text-sm text-muted-foreground">Keine Daten im Zeitraum.</div>
      {:else}
        <BarChart bars={monthlyBars} ariaLabel="Monatlicher Umsatz im Zeitraum" />
      {/if}
    </CardContent>
  </Card>

  <TopCustomersCard
    periodLabel={period.label}
    loading={dashboard.loading}
    customers={data?.topCustomers ?? []}
  />
</div>

{#if data && data.cashFlow.total > 0}
  <CashFlowCard forecast={data.cashFlow} />
{/if}

{#if taxReserve.error}
  <p class="mb-6 text-sm text-muted-foreground">
    Steuer-Rücklage konnte nicht berechnet werden: {taxReserve.error}
  </p>
{:else if taxReserve.data}
  <TaxReserveCard reserve={taxReserve.data} />
{/if}

<div class="grid grid-cols-1 @4xl:grid-cols-3 gap-4 mb-6">
  <ReceivablesCard
    loading={dashboard.loading}
    receivables={data?.receivables ?? { daysOverdue: null, openTotal: 0, openCount: 0 }}
  />
  <FollowUpsCard loading={dashboard.loading} followUps={data?.followUps ?? []} />
</div>

{#if settled && settled.dueTemplates.length > 0}
  <DueTemplatesSection templates={settled.dueTemplates} />
{/if}
