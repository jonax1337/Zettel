<script lang="ts">
  import { formatDuration } from "$lib/time/duration";
  import type { TimeSummary } from "$lib/time/summary";
  import { centsToEur } from "$lib/utils/money";
  import { Card, CardContent } from "$lib/ui";

  type Props = { summary: TimeSummary };
  let { summary }: Props = $props();

  const items = $derived([
    { label: "Gesamt", value: `${formatDuration(summary.totalMinutes)} Std`, hint: null },
    { label: "Offen", value: `${formatDuration(summary.openMinutes)} Std`, hint: `${centsToEur(summary.openAmountCent)} netto` },
    { label: "Abgerechnet", value: `${formatDuration(summary.billedMinutes)} Std`, hint: null },
  ]);
</script>

<div class="mb-5 grid grid-cols-3 gap-3">
  {#each items as item (item.label)}
    <Card>
      <CardContent>
        <div class="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</div>
        <div class="text-xl font-semibold tabular-nums">{item.value}</div>
        {#if item.hint}
          <div class="text-xs text-muted-foreground tabular-nums">{item.hint}</div>
        {/if}
      </CardContent>
    </Card>
  {/each}
</div>
