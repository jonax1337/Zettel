<script lang="ts">
  import { link } from "svelte-spa-router";
  import type { Customer } from "$lib/db/schema";
  import { loadCustomerOverview } from "$lib/db/customer-overview";
  import { periodForYear } from "$lib/dashboard/period";
  import { formatMoney } from "$lib/utils/currency";
  import DetailPanel from "../../invoice/detail/DetailPanel.svelte";

  let { customer }: { customer: Customer } = $props();

  type OpenBalance = { state: "loading" } | { state: "failed" } | { state: "ready"; cent: number; count: number };
  let openBalance = $state<OpenBalance>({ state: "loading" });

  // Only the open balance is shown; the year is irrelevant for it.
  $effect(() => {
    const customerId = customer.id;
    let stale = false;
    openBalance = { state: "loading" };
    loadCustomerOverview(customerId, periodForYear(new Date().getFullYear()))
      .then((overview) => {
        if (!stale) openBalance = { state: "ready", cent: overview.openBalance, count: overview.openCount };
      })
      .catch((e) => {
        console.error("Loading the open balance of the customer failed", e);
        if (!stale) openBalance = { state: "failed" };
      });
    return () => (stale = true);
  });
</script>

<DetailPanel title="Kunde">
  {#snippet aside()}
    <a href="/customers/{customer.id}" use:link class="hover:text-foreground hover:underline">Öffnen</a>
  {/snippet}
  <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
    <dt class="text-muted-foreground">E-Mail</dt>
    <dd class="break-words text-right font-semibold {customer.email ? '' : 'font-normal text-muted-foreground'}">
      {customer.email ?? "keine"}
    </dd>
    <dt class="text-muted-foreground">Leitweg-ID</dt>
    <dd class="break-words text-right font-semibold {customer.leitwegId ? '' : 'font-normal text-muted-foreground'}">
      {customer.leitwegId ?? "keine"}
    </dd>
    <dt class="text-muted-foreground">Offen</dt>
    <dd class="text-right font-semibold tabular-nums">
      {#if openBalance.state === "ready"}
        {formatMoney(openBalance.cent, "EUR")}
        {#if openBalance.count > 0}
          <span class="font-normal text-muted-foreground">({openBalance.count})</span>
        {/if}
      {:else}
        <span class="font-normal text-muted-foreground">{openBalance.state === "loading" ? "…" : "nicht verfügbar"}</span>
      {/if}
    </dd>
  </dl>
</DetailPanel>
