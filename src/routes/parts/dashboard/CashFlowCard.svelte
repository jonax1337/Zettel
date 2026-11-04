<script lang="ts">
  import { Card, CardContent } from "$lib/ui";
  import type { CashFlowForecast } from "$lib/dashboard/queries";
  import { centsToEur } from "$lib/utils/money";

  type Props = { forecast: CashFlowForecast };
  let { forecast }: Props = $props();
</script>

<Card class="mb-6">
  <CardContent>
    <div class="flex items-center justify-between gap-6 flex-wrap">
      <div class="min-w-0">
        <div class="text-xs text-muted-foreground uppercase tracking-wider">
          Liquiditäts-Vorschau · nächste 30 Tage
        </div>
        <div class="text-2xl font-semibold tabular-nums mt-0.5">
          {centsToEur(forecast.total)}
        </div>
      </div>
      <div class="flex items-baseline gap-6 text-sm">
        {#if forecast.overdue > 0}
          <div>
            <div class="text-warning font-medium tabular-nums">{centsToEur(forecast.overdue)}</div>
            <div class="text-[10px] text-muted-foreground uppercase tracking-wider">
              überfällig ({forecast.overdueCount})
            </div>
          </div>
        {/if}
        <div>
          <div class="font-medium tabular-nums">{centsToEur(forecast.openDue)}</div>
          <div class="text-[10px] text-muted-foreground uppercase tracking-wider">
            fällig ({forecast.openDueCount})
          </div>
        </div>
        {#if forecast.recurringCount > 0}
          <div>
            <div class="font-medium tabular-nums text-muted-foreground">≈ {centsToEur(forecast.recurringEstimate)}</div>
            <div class="text-[10px] text-muted-foreground uppercase tracking-wider">
              Wiederkehrend ({forecast.recurringCount})
            </div>
          </div>
        {/if}
      </div>
    </div>
  </CardContent>
</Card>
