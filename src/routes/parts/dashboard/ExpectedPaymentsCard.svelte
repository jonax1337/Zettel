<script lang="ts">
  import { Card } from "$lib/ui";
  import ExpectedPaymentsChart from "$lib/components/charts/ExpectedPaymentsChart.svelte";
  import type { ExpectedColumn } from "$lib/components/charts/chart-types";
  import type { CashFlowForecast } from "$lib/dashboard/queries";
  import { centsToEur } from "$lib/utils/money";
  import { pluralize } from "../entity/format";

  type Props = {
    loading: boolean;
    error: string | null;
    forecast: CashFlowForecast | null;
    columns: ExpectedColumn[];
  };
  let { loading, error, forecast, columns }: Props = $props();

  const parts = $derived(
    forecast
      ? [
          forecast.overdueCount > 0 ? `${centsToEur(forecast.overdue)} überfällig` : null,
          forecast.openDueCount > 0 ? `${centsToEur(forecast.openDue)} fällig` : null,
          forecast.recurringCount > 0
            ? `≈\u00A0${centsToEur(forecast.recurringEstimate)} aus ${forecast.recurringCount} ${pluralize(forecast.recurringCount, "Serie", "Serien")} geschätzt`
            : null,
        ].filter((part) => part !== null)
      : [],
  );
</script>

<Card class="gap-0 p-5">
  <h2 class="mb-2.5">Erwartete Eingänge</h2>
  {#if error}
    <p class="text-sm text-destructive">Konnte nicht geladen werden: {error}</p>
  {:else if loading || !forecast}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else}
    <div class="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight tabular-nums">
      {centsToEur(forecast.total)}
    </div>
    <div class="text-[13px] text-muted-foreground">in den nächsten 30 Tagen{parts.length ? `, davon ${parts.join(", ")}` : ""}</div>
    <div class="mt-3">
      <ExpectedPaymentsChart {columns} ariaLabel="Erwartete Zahlungseingänge pro Woche" />
    </div>
  {/if}
</Card>
