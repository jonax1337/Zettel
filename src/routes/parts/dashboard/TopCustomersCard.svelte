<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, CardContent } from "$lib/ui";
  import { Trophy } from "$lib/brand-icons";
  import type { TopCustomerRow } from "$lib/dashboard/queries";
  import { centsToEur } from "$lib/utils/money";

  type Props = {
    periodLabel: string;
    loading: boolean;
    customers: TopCustomerRow[];
  };
  let { periodLabel, loading, customers }: Props = $props();

  const maxTotal = $derived(Math.max(1, ...customers.map((c) => c.total)));
</script>

<Card>
  <CardContent>
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-xs text-muted-foreground uppercase tracking-wider">Top-5-Kunden</div>
        <div class="text-xs text-muted-foreground mt-0.5">{periodLabel}</div>
      </div>
      <Trophy class="size-4 text-muted-foreground" />
    </div>
    {#if loading}
      <div class="h-32 grid place-items-center text-sm text-muted-foreground">Lade…</div>
    {:else if customers.length === 0}
      <div class="h-32 grid place-items-center text-sm text-muted-foreground text-center">
        Keine Rechnungen<br />im Zeitraum.
      </div>
    {:else}
      <ul class="flex flex-col gap-2.5">
        {#each customers as customer, i (customer.customerId)}
          <li>
            <button
              type="button"
              onclick={() => push(`/customers/${customer.customerId}`)}
              class="w-full text-left group"
            >
              <div class="flex items-baseline justify-between gap-2 text-sm">
                <span class="flex items-baseline gap-2 min-w-0">
                  <span class="text-muted-foreground tabular-nums w-4 shrink-0 text-xs">{i + 1}.</span>
                  <span class="truncate group-hover:text-foreground transition-colors">{customer.name}</span>
                </span>
                <span class="font-mono tabular-nums text-xs shrink-0">{centsToEur(customer.total)}</span>
              </div>
              <div class="mt-1.5 ml-6 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full bg-primary/70 group-hover:bg-primary transition-all"
                  style="width: {(customer.total / maxTotal) * 100}%"
                ></div>
              </div>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </CardContent>
</Card>
