<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Card } from "$lib/ui";
  import ShareList from "$lib/components/charts/ShareList.svelte";
  import { centsToEur } from "$lib/utils/money";
  import { pluralize } from "../entity/format";
  import type { CustomerShare } from "./chart-data";

  type Props = {
    periodLabel: string;
    loading: boolean;
    error: string | null;
    shares: CustomerShare[];
    customerCount: number | null;
  };
  let { periodLabel, loading, error, shares, customerCount }: Props = $props();

  const items = $derived(
    shares.map(({ customer, percent, ratio }) => ({
      key: customer.customerId,
      label: customer.name,
      value: centsToEur(customer.total),
      share: percent === null ? null : `${percent} %`,
      ratio,
      tooltip: [
        customer.name,
        `${centsToEur(customer.total)} brutto · ${customer.invoiceCount} ${pluralize(customer.invoiceCount, "Rechnung", "Rechnungen")}`,
        percent === null ? "" : `${percent} % des Umsatzes`,
      ]
        .filter(Boolean)
        .join("\n"),
      href: `/customers/${customer.customerId}`,
    })),
  );
</script>

<Card class="gap-0 p-5">
  <div class="mb-1 flex items-baseline gap-2.5">
    <h2>Stärkste Kunden</h2>
    <a href="/customers" use:link class="ml-auto text-[13px] font-semibold text-muted-foreground hover:text-foreground">
      {customerCount === null ? "Alle Kunden" : `Alle ${customerCount} ${pluralize(customerCount, "Kunde", "Kunden")}`}
    </a>
  </div>
  <div class="mb-3.5 text-[13px] text-muted-foreground">Anteil am Umsatz {periodLabel}, brutto</div>
  {#if error}
    <p class="text-sm text-destructive">Konnte nicht geladen werden: {error}</p>
  {:else if loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if items.length === 0}
    <p class="text-sm text-muted-foreground">Keine Rechnungen im Zeitraum.</p>
  {:else}
    <ShareList {items} ariaLabel="Stärkste Kunden nach Umsatz" />
  {/if}
</Card>
