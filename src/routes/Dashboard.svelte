<script lang="ts">
  import { push } from "svelte-spa-router";
  import { listCustomers } from "$lib/db/queries";
  import {
    dashboardStats,
    monthlyRevenue,
    recentInvoices,
    topCustomers,
    type InvoiceListRow,
    type MonthlyRevenuePoint,
    type TopCustomer,
  } from "$lib/db/invoices";
  import type { InvoiceStatus } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { Card, CardContent, Button, Badge } from "$lib/ui";
  import RevenueChart from "$lib/components/RevenueChart.svelte";
  import {
    Users,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Plus,
    UserPlus,
    Trophy,
    Repeat,
    FileText,
    FileSignature,
  } from "@lucide/svelte";
  import { openOffersStats, expireDueOffers } from "$lib/db/offers";
  import {
    dueRecurring,
    generateInvoiceFromRecurring,
    type RecurringListRow,
  } from "$lib/db/recurring";
  import { toast } from "$lib/ui";

  let customerCount = $state(0);
  let stats = $state({
    openCount: 0,
    openTotal: 0,
    paidYtdTotal: 0,
    overdueCount: 0,
    overdueTotal: 0,
  });
  let offerStats = $state({ count: 0, total: 0, expiringSoonCount: 0 });
  let recent = $state<InvoiceListRow[]>([]);
  let revenue = $state<MonthlyRevenuePoint[]>([]);
  let top = $state<TopCustomer[]>([]);
  let due = $state<RecurringListRow[]>([]);
  let loading = $state(true);

  async function reload() {
    await expireDueOffers().catch(() => {});
    const [cs, s, r, rev, tc, dr, os] = await Promise.all([
      listCustomers(),
      dashboardStats(),
      recentInvoices(10),
      monthlyRevenue(12),
      topCustomers(5, 12),
      dueRecurring(),
      openOffersStats(),
    ]);
    customerCount = cs.length;
    stats = s;
    recent = r;
    revenue = rev;
    top = tc;
    due = dr;
    offerStats = os;
    loading = false;
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

  $effect(() => {
    reload();
  });

  function newInvoice() {
    push("/invoices/new");
  }

  function newCustomer() {
    push("/customers/new");
  }

  const statusLabel: Record<InvoiceStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };

  const statusVariant: Record<InvoiceStatus, "secondary" | "warning" | "success" | "outline"> = {
    draft: "secondary",
    sent: "warning",
    paid: "success",
    cancelled: "outline",
  };

  const topMax = $derived(Math.max(1, ...top.map((c) => c.paidTotal)));
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Dashboard</h1>
    <p class="text-sm text-muted-foreground mt-1">Übersicht & Schnellzugriff</p>
  </div>
  <div class="flex gap-2">
    <Button onclick={newInvoice}>
      <Plus />
      Neue Rechnung
    </Button>
    <Button onclick={newCustomer} variant="outline">
      <UserPlus />
      Neuer Kunde
    </Button>
  </div>
</header>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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
    class="cursor-pointer hover:bg-muted/30 transition-colors"
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

  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Offen</span>
        <Clock class="size-4 text-warning" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">{loading ? "…" : centsToEur(stats.openTotal)}</div>
      <div class="text-xs text-muted-foreground mt-1">
        {stats.openCount} Rechnung{stats.openCount === 1 ? "" : "en"}
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">
          Bezahlt {new Date().getFullYear()}
        </span>
        <CheckCircle2 class="size-4 text-success" />
      </div>
      <div class="text-2xl font-semibold mt-2 tabular-nums">{loading ? "…" : centsToEur(stats.paidYtdTotal)}</div>
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted-foreground uppercase tracking-wider">Überfällig</span>
        <AlertTriangle class={"size-4 " + (stats.overdueCount > 0 ? "text-destructive" : "text-muted-foreground")} />
      </div>
      <div class={"text-2xl font-semibold mt-2 tabular-nums " + (stats.overdueCount > 0 ? "text-destructive" : "")}>
        {loading ? "…" : centsToEur(stats.overdueTotal)}
      </div>
      <div class="text-xs text-muted-foreground mt-1">
        {stats.overdueCount} Rechnung{stats.overdueCount === 1 ? "" : "en"}
      </div>
    </CardContent>
  </Card>
</div>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
  <Card class="lg:col-span-2">
    <CardContent>
      {#if loading}
        <div class="h-40 grid place-items-center text-sm text-muted-foreground">Lade…</div>
      {:else}
        <RevenueChart data={revenue} />
      {/if}
    </CardContent>
  </Card>

  <Card>
    <CardContent>
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Top-Kunden</div>
          <div class="text-xs text-muted-foreground mt-0.5">letzte 12 Monate</div>
        </div>
        <Trophy class="size-4 text-muted-foreground" />
      </div>
      {#if loading}
        <div class="h-32 grid place-items-center text-sm text-muted-foreground">Lade…</div>
      {:else if top.length === 0}
        <div class="h-32 grid place-items-center text-sm text-muted-foreground text-center">
          Noch keine bezahlten<br />Rechnungen.
        </div>
      {:else}
        <ul class="flex flex-col gap-2.5">
          {#each top as c, i (c.customerId)}
            {@const pct = (c.paidTotal / topMax) * 100}
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
                  <span class="font-mono tabular-nums text-xs shrink-0">{centsToEur(c.paidTotal)}</span>
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
        <tbody>
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

<section>
  <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-3">
    Letzte Rechnungen
  </h2>
  {#if loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if recent.length === 0}
    <Card>
      <CardContent class="py-10 text-center text-sm text-muted-foreground">
        Noch keine Rechnungen.
      </CardContent>
    </Card>
  {:else}
    <Card class="overflow-hidden py-0">
      <table class="w-full text-sm">
        <tbody>
          {#each recent as inv (inv.id)}
            <tr
              class="border-t first:border-t-0 hover:bg-muted/40 cursor-pointer transition-colors"
              onclick={() => push(`/invoices/${inv.id}`)}
            >
              <td class="px-4 py-3 font-mono text-xs">{inv.number}</td>
              <td class="px-4 py-3 text-muted-foreground">{formatDate(inv.issueDate)}</td>
              <td class="px-4 py-3">{inv.customerName}</td>
              <td class="px-4 py-3">
                <Badge variant={statusVariant[inv.status]}>{statusLabel[inv.status]}</Badge>
              </td>
              <td class="px-4 py-3 text-right font-mono tabular-nums">{centsToEur(inv.total)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </Card>
  {/if}
</section>
