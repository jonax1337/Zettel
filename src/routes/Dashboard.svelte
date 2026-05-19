<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, CardContent, Button, toast } from "$lib/ui";
  import {
    Users,
    Clock,
    TrendingUp,
    TrendingDown,
    Plus,
    UserPlus,
    Trophy,
    Repeat,
    FileText,
    FileSignature,
    Wallet,
    Scale,
    FlaskConical,
    Hourglass,
    Bell,
    AlertTriangle,
  } from "@lucide/svelte";
  import PeriodSwitcher from "$lib/components/PeriodSwitcher.svelte";
  import BarChart from "$lib/components/BarChart.svelte";
  import {
    loadDefaultPeriod,
    type Period,
  } from "$lib/dashboard/period";
  import {
    loadKpis,
    monthlyRevenueInPeriod,
    topCustomersInPeriod,
    oldestOverdue,
    loadFollowUps,
    type Kpis,
    type MonthPoint,
    type TopCustomerRow,
    type OldestOverdue,
    type FollowUpItem,
  } from "$lib/dashboard/queries";
  import { computeTaxRücklage, type TaxRücklageResult } from "$lib/dashboard/tax";
  import { listCustomers } from "$lib/db/queries";
  import { openOffersStats, expireDueOffers } from "$lib/db/offers";
  import { dueRecurring, generateInvoiceFromRecurring, type RecurringListRow } from "$lib/db/recurring";
  import { isSandboxActive } from "$lib/db/client";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";

  let period = $state<Period>(loadDefaultPeriod());

  let sandbox = $state(false);
  let customerCount = $state(0);
  let kpis = $state<Kpis | null>(null);
  let monthly = $state<MonthPoint[]>([]);
  let top = $state<TopCustomerRow[]>([]);
  let aging = $state<OldestOverdue>({ daysOverdue: null, openTotal: 0, openCount: 0 });
  let followUps = $state<FollowUpItem[]>([]);
  let offerStats = $state({ count: 0, total: 0, expiringSoonCount: 0 });
  let due = $state<RecurringListRow[]>([]);
  let taxRücklage = $state<TaxRücklageResult | null>(null);
  let loading = $state(true);

  $effect(() => {
    isSandboxActive().then((v) => (sandbox = v));
  });

  async function reload(p: Period) {
    loading = true;
    await expireDueOffers().catch(() => {});
    const [cs, k, mon, tc, ag, fu, os, dr] = await Promise.all([
      listCustomers(),
      loadKpis(p),
      monthlyRevenueInPeriod(p),
      topCustomersInPeriod(p, 5),
      oldestOverdue(),
      loadFollowUps(),
      openOffersStats(),
      dueRecurring(),
    ]);
    customerCount = cs.length;
    kpis = k;
    monthly = mon;
    top = tc;
    aging = ag;
    followUps = fu;
    offerStats = os;
    due = dr;
    // Steuer-Rücklage immer am Jahr der gewählten Periode hängen (das Konzept
    // ist annual; Monat/Quartal-Selektionen mappen auf ihr Containerjahr).
    const taxYear = new Date(p.start * 1000).getFullYear();
    computeTaxRücklage(taxYear)
      .then((t) => (taxRücklage = t))
      .catch(() => (taxRücklage = null));
    loading = false;
  }

  $effect(() => {
    reload(period);
  });

  function onPeriodChange(p: Period) {
    period = p;
  }

  async function onGenerateDue(id: number) {
    try {
      const invoiceId = await generateInvoiceFromRecurring(id);
      toast.success("Rechnung erzeugt");
      push(`/invoices/${invoiceId}`);
    } catch (e) {
      toast.error("Erzeugen fehlgeschlagen", String(e));
    }
  }

  const topMax = $derived(Math.max(1, ...top.map((c) => c.total)));
  const monthlyBars = $derived(
    monthly.map((m) => ({ label: m.label, value: m.total, sublabel: String(m.year) })),
  );
  const followUpGroups = $derived({
    overdue: followUps.filter((f) => f.group === "overdue"),
    today: followUps.filter((f) => f.group === "today"),
    week: followUps.filter((f) => f.group === "week"),
  });
</script>

{#if sandbox}
  <button
    type="button"
    onclick={() => push("/settings")}
    class="mb-6 w-full rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 transition-colors p-4 flex items-center gap-3 text-left cursor-pointer"
  >
    <FlaskConical class="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
    <div class="flex-1">
      <h2 class="text-sm font-semibold text-amber-900 dark:text-amber-200">Sandbox aktiv</h2>
      <p class="text-xs text-amber-800/80 dark:text-amber-200/80">Hier kannst du gefahrlos testen. Echte Daten sind nicht betroffen.</p>
    </div>
    <span class="text-xs text-amber-900/70 dark:text-amber-200/70">Einstellungen →</span>
  </button>
{/if}

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Dashboard</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Zeitraum: <span class="font-medium text-foreground">{period.label}</span>
    </p>
  </div>
  <div class="flex flex-wrap items-end gap-3">
    <PeriodSwitcher {period} onChange={onPeriodChange} />
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

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6 stagger">
  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Umsatz netto</span>
        <TrendingUp class="size-4 text-muted-foreground" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">
        {loading || !kpis ? "…" : centsToEur(kpis.revenueNet)}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Umsatz brutto</span>
        <TrendingUp class="size-4 text-muted-foreground" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">
        {loading || !kpis ? "…" : centsToEur(kpis.revenueGross)}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Aufwand netto</span>
        <TrendingDown class="size-4 text-muted-foreground" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">
        {loading || !kpis ? "…" : centsToEur(kpis.expenseNet)}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Saldo</span>
        <Scale class="size-4 text-muted-foreground" />
      </div>
      <div
        class={"text-2xl font-semibold mt-2 tabular-nums " +
          (kpis && kpis.balance < 0 ? "text-destructive" : kpis && kpis.balance > 0 ? "text-success" : "")}
      >
        {loading || !kpis ? "…" : centsToEur(kpis.balance)}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Offene Posten</span>
        <Clock class={"size-4 " + (kpis && kpis.openCount > 0 ? "text-warning" : "text-muted-foreground")} />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">
        {loading || !kpis ? "…" : centsToEur(kpis.openTotal)}
      </div>
      <div class="text-xs text-muted-foreground mt-1">
        {kpis?.openCount ?? 0} Rechnung{kpis?.openCount === 1 ? "" : "en"}
      </div>
    </CardContent>
  </Card>
</div>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 stagger">
  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Kunden</span>
        <Users class="size-4 text-muted-foreground" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">{loading ? "…" : customerCount}</div>
    </CardContent>
  </Card>

  <Card
    class="cursor-pointer hover:bg-muted/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
    onclick={() => push("/offers")}
  >
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Offene Angebote</span>
        <FileSignature class="size-4 text-muted-foreground" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">{loading ? "…" : centsToEur(offerStats.total)}</div>
      <div class="text-xs text-muted-foreground mt-1">
        {offerStats.count} Angebot{offerStats.count === 1 ? "" : "e"}{#if offerStats.expiringSoonCount > 0}
          <span class="text-amber-600 dark:text-amber-500"> · {offerStats.expiringSoonCount} läuft bald ab</span>
        {/if}
      </div>
    </CardContent>
  </Card>

  <Card
    class="cursor-pointer hover:bg-muted/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200"
    onclick={() => push("/expenses")}
  >
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Eingangsrechnungen</span>
        <Wallet class="size-4 text-muted-foreground" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">
        {loading || !kpis ? "…" : centsToEur(kpis.expenseNet)}
      </div>
      <div class="text-xs text-muted-foreground mt-1">netto im Zeitraum</div>
    </CardContent>
  </Card>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
  <Card class="lg:col-span-2">
    <CardContent>
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Umsatz pro Monat</div>
          <div class="text-xs text-muted-foreground mt-0.5">{period.label}</div>
        </div>
      </div>
      {#if loading}
        <div class="h-40 grid place-items-center text-sm text-muted-foreground">Lade…</div>
      {:else if monthlyBars.length === 0}
        <div class="h-40 grid place-items-center text-sm text-muted-foreground">Keine Daten im Zeitraum.</div>
      {:else}
        <BarChart bars={monthlyBars} ariaLabel="Monatlicher Umsatz im Zeitraum" />
      {/if}
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Top-5-Kunden</div>
          <div class="text-xs text-muted-foreground mt-0.5">{period.label}</div>
        </div>
        <Trophy class="size-4 text-muted-foreground" />
      </div>
      {#if loading}
        <div class="h-32 grid place-items-center text-sm text-muted-foreground">Lade…</div>
      {:else if top.length === 0}
        <div class="h-32 grid place-items-center text-sm text-muted-foreground text-center">
          Keine Rechnungen<br />im Zeitraum.
        </div>
      {:else}
        <ul class="flex flex-col gap-2.5">
          {#each top as c, i (c.customerId)}
            {@const pct = (c.total / topMax) * 100}
            <li>
              <button
                type="button"
                onclick={() => push(`/customers/${c.customerId}`)}
                class="w-full text-left group"
              >
                <div class="flex items-baseline justify-between gap-2 text-sm">
                  <span class="flex items-baseline gap-2 min-w-0">
                    <span class="text-muted-foreground tabular-nums w-4 shrink-0 text-xs">{i + 1}.</span>
                    <span class="truncate group-hover:text-foreground transition-colors">{c.name}</span>
                  </span>
                  <span class="font-mono tabular-nums text-xs shrink-0">{centsToEur(c.total)}</span>
                </div>
                <div class="mt-1.5 ml-6 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    class="h-full bg-primary/70 group-hover:bg-primary transition-all"
                    style="width: {pct}%"
                  ></div>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </CardContent>
  </Card>
</div>

{#if taxRücklage}
  <button
    type="button"
    onclick={() => push("/reports/taxes")}
    class="block w-full text-left mb-6 group"
  >
    <Card class="hover:border-foreground/30 transition-colors">
      <CardContent>
        <div class="flex items-center justify-between gap-6">
          <div class="min-w-0">
              <div class="text-xs text-muted-foreground uppercase tracking-wider">
                Steuer-Rücklage {taxRücklage.year} · Tarif {taxRücklage.projected.income.tarifYear}
              </div>
              <div class="flex items-baseline gap-6 mt-0.5">
                <div>
                  <div class="text-2xl font-semibold tabular-nums">
                    {centsToEur(taxRücklage.ytd.recommendedReserveCent)}
                  </div>
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider">YTD</div>
                </div>
                <div>
                  <div class="text-2xl font-semibold tabular-nums text-muted-foreground">
                    {centsToEur(taxRücklage.projected.recommendedReserveCent)}
                  </div>
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Hochgerechnet</div>
                </div>
                {#if taxRücklage.flags.usePauschal}
                  <div>
                    <div class="text-2xl font-semibold tabular-nums text-muted-foreground">
                      {centsToEur(taxRücklage.pauschalReserveCent)}
                    </div>
                    <div class="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Pauschal {taxRücklage.flags.pauschalPercent}%
                    </div>
                  </div>
                {/if}
              </div>
          </div>
          <div class="text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
            Details →
          </div>
        </div>
      </CardContent>
    </Card>
  </button>
{/if}

<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
  <Card class="lg:col-span-2">
    <CardContent>
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Offene Forderungen</div>
        </div>
        <Hourglass class="size-4 text-muted-foreground" />
      </div>
      {#if loading}
        <div class="text-sm text-muted-foreground">Lade…</div>
      {:else if aging.openCount === 0}
        <div class="text-sm text-muted-foreground">Keine offenen Forderungen.</div>
      {:else}
        <div class="space-y-1">
          <div class="text-2xl font-semibold tabular-nums">{centsToEur(aging.openTotal)}</div>
          <div class="text-sm text-muted-foreground">
            {aging.openCount} {aging.openCount === 1 ? "Rechnung" : "Rechnungen"} offen
            {#if aging.daysOverdue !== null && aging.daysOverdue > 0}
              · älteste {aging.daysOverdue} {aging.daysOverdue === 1 ? "Tag" : "Tage"} überfällig
            {:else if aging.daysOverdue !== null && aging.daysOverdue <= 0}
              · alle innerhalb Frist
            {/if}
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Wiedervorlage</div>
          <div class="text-xs text-muted-foreground mt-0.5">heute + 7 Tage</div>
        </div>
        <Bell class="size-4 text-muted-foreground" />
      </div>
      {#if loading}
        <div class="h-32 grid place-items-center text-sm text-muted-foreground">Lade…</div>
      {:else if followUps.length === 0}
        <div class="h-32 grid place-items-center text-sm text-muted-foreground text-center">
          Keine Wiedervorlagen.
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#if followUpGroups.overdue.length > 0}
            <div>
              <div class="text-[11px] uppercase tracking-wider text-destructive mb-1 flex items-center gap-1">
                <AlertTriangle class="size-3" /> Überfällig
              </div>
              <ul class="flex flex-col gap-1">
                {#each followUpGroups.overdue as f (f.kind + f.id)}
                  <li>
                    <button
                      type="button"
                      onclick={() => push(f.href)}
                      class="w-full text-left text-sm hover:bg-muted/40 rounded px-2 py-1 -mx-2 cursor-pointer transition-colors flex items-baseline justify-between gap-2"
                    >
                      <span class="truncate">
                        <span class="font-medium">{f.title}</span>
                        <span class="text-muted-foreground"> · {f.subtitle}</span>
                      </span>
                      <span class="text-xs tabular-nums text-destructive shrink-0">{formatDate(f.followUpDate)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if followUpGroups.today.length > 0}
            <div>
              <div class="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-500 mb-1">Heute</div>
              <ul class="flex flex-col gap-1">
                {#each followUpGroups.today as f (f.kind + f.id)}
                  <li>
                    <button
                      type="button"
                      onclick={() => push(f.href)}
                      class="w-full text-left text-sm hover:bg-muted/40 rounded px-2 py-1 -mx-2 cursor-pointer transition-colors flex items-baseline justify-between gap-2"
                    >
                      <span class="truncate">
                        <span class="font-medium">{f.title}</span>
                        <span class="text-muted-foreground"> · {f.subtitle}</span>
                      </span>
                      <span class="text-xs tabular-nums text-muted-foreground shrink-0">{formatDate(f.followUpDate)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if followUpGroups.week.length > 0}
            <div>
              <div class="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Diese Woche</div>
              <ul class="flex flex-col gap-1">
                {#each followUpGroups.week as f (f.kind + f.id)}
                  <li>
                    <button
                      type="button"
                      onclick={() => push(f.href)}
                      class="w-full text-left text-sm hover:bg-muted/40 rounded px-2 py-1 -mx-2 cursor-pointer transition-colors flex items-baseline justify-between gap-2"
                    >
                      <span class="truncate">
                        <span class="font-medium">{f.title}</span>
                        <span class="text-muted-foreground"> · {f.subtitle}</span>
                      </span>
                      <span class="text-xs tabular-nums text-muted-foreground shrink-0">{formatDate(f.followUpDate)}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>
</div>

{#if !loading && due.length > 0}
  <section class="mb-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
        <Repeat class="size-4" />
        Fällige Vorlagen
      </h2>
      <span class="text-xs text-muted-foreground">{due.length} fällig</span>
    </div>
    <Card class="overflow-hidden py-0">
      <table class="w-full text-sm">
        <tbody class="stagger">
          {#each due as tmpl (tmpl.id)}
            <tr class="border-t first:border-t-0">
              <td class="px-4 py-3 font-medium">{tmpl.name}</td>
              <td class="px-4 py-3 text-muted-foreground">{tmpl.customerName}</td>
              <td class="px-4 py-3 text-amber-600 dark:text-amber-500 tabular-nums">
                fällig {formatDate(tmpl.nextDueDate)}
              </td>
              <td class="px-4 py-3 text-right">
                <Button size="sm" onclick={() => onGenerateDue(tmpl.id)}>
                  <FileText class="size-3.5" />
                  Jetzt erzeugen
                </Button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </Card>
  </section>
{/if}
