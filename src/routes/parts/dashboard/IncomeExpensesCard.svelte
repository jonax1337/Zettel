<script lang="ts">
  import { Card } from "$lib/ui";
  import IncomeExpenseChart from "$lib/components/charts/IncomeExpenseChart.svelte";
  import type { IncomeMonth } from "$lib/components/charts/chart-types";

  type Props = {
    periodLabel: string;
    loading: boolean;
    error: string | null;
    months: IncomeMonth[];
  };
  let { periodLabel, loading, error, months }: Props = $props();
</script>

<Card class="gap-3 p-5">
  <div class="flex items-baseline gap-2.5">
    <h2>Einnahmen und Ausgaben</h2>
    <span class="text-[13px] text-muted-foreground">{periodLabel}, netto</span>
  </div>
  {#if error}
    <div class="grid h-[250px] place-items-center text-sm text-destructive">Konnte nicht geladen werden: {error}</div>
  {:else if loading}
    <div class="grid h-[250px] place-items-center text-sm text-muted-foreground">Lade…</div>
  {:else if months.length === 0}
    <div class="grid h-[250px] place-items-center text-sm text-muted-foreground">Keine Daten im Zeitraum.</div>
  {:else}
    <IncomeExpenseChart {months} ariaLabel="Einnahmen und Ausgaben pro Monat, {periodLabel}, mit Vorjahreswert" />
  {/if}
</Card>
