<script lang="ts">
  import { link } from "svelte-spa-router";
  import { TrendingDown, TrendingUp } from "$lib/brand-icons";
  import { Card } from "$lib/ui";
  import { changeBetween, describeChange } from "$lib/dashboard/change";
  import type { Kpis } from "$lib/dashboard/queries";
  import { centsToEur } from "$lib/utils/money";

  type Props = {
    /** Label of the period, e.g. "2026". */
    periodLabel: string;
    /** The period has begun and not ended yet. */
    running: boolean;
    kpis: Kpis | null;
    previousKpis: Kpis | null;
    error: string | null;
  };
  let { periodLabel, running, kpis, previousKpis, error }: Props = $props();

  const change = $derived(kpis && previousKpis ? changeBetween(kpis.balance, previousKpis.balance) : null);
  const profitClass = $derived(kpis && kpis.balance < 0 ? "text-destructive" : "");
</script>

<Card class="gap-0 p-6">
  <div class="font-semibold text-muted-foreground">Gewinn {periodLabel}{running ? " bis heute" : ""}</div>
  {#if error}
    <p class="mt-2 text-sm text-destructive">Konnte nicht geladen werden: {error}</p>
  {:else}
  <div class="mt-1.5 mb-2 font-display text-[40px] leading-[1.1] font-extrabold tracking-tight tabular-nums {profitClass}">
    {kpis ? centsToEur(kpis.balance) : "…"}
  </div>
  {#if change}
    <span
      class="inline-flex items-center gap-1.5 font-bold {change.direction === 'up'
        ? 'text-success'
        : change.direction === 'down'
          ? 'text-destructive'
          : 'text-muted-foreground'}"
    >
      {#if change.direction === "up"}
        <TrendingUp class="size-4" />
      {:else if change.direction === "down"}
        <TrendingDown class="size-4" />
      {/if}
      {describeChange(change)}
    </span>
  {/if}
  <div class="mt-5 grid grid-cols-2 gap-5 border-t pt-4">
    <div>
      <b class="block font-display text-lg font-extrabold tabular-nums">{kpis ? centsToEur(kpis.revenueNet) : "…"}</b>
      <span class="text-[13px] text-muted-foreground">Einnahmen netto</span>
      {#if kpis}
        <span class="block text-xs text-muted-foreground tabular-nums">brutto {centsToEur(kpis.revenueGross)}</span>
      {/if}
    </div>
    <a href="/expenses" use:link class="group rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
      <b class="block font-display text-lg font-extrabold tabular-nums">{kpis ? centsToEur(kpis.expenseNet) : "…"}</b>
      <span class="text-[13px] text-muted-foreground group-hover:text-foreground">Ausgaben netto</span>
    </a>
  </div>
  {/if}
</Card>
