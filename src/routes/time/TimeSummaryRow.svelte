<script lang="ts">
  import { formatDuration } from "$lib/time/duration";
  import type { TimeSummary } from "$lib/time/summary";
  import { centsToEur } from "$lib/utils/money";
  import { Button, Stat, StatRow } from "$lib/ui";
  import { FilePlus2 } from "$lib/brand-icons";
  import { periodTotalLabel, type TimePeriod } from "./period";

  type Props = {
    period: TimePeriod;
    /** Replaces the period's own name on the first figure, e.g. when the list spans all periods. */
    totalLabel?: string;
    summary: TimeSummary;
    /** Why the open entries cannot be billed in one go; null when they can. */
    billingBlocker: string | null;
    canBill: boolean;
    onBillOpen: () => void;
  };
  let { period, totalLabel, summary, billingBlocker, canBill, onBillOpen }: Props = $props();
</script>

<StatRow>
  <Stat label={totalLabel ?? periodTotalLabel(period, new Date())} value="{formatDuration(summary.totalMinutes)} Std" />
  <Stat
    label="Noch nicht abgerechnet"
    value="{formatDuration(summary.openMinutes)} Std"
    hint="{centsToEur(summary.openAmountCent)} netto"
  >
    {#snippet action()}
      <div class="mt-2 flex flex-col items-start gap-1.5">
        <Button size="sm" variant="outline" onclick={onBillOpen} disabled={!canBill || billingBlocker !== null}>
          <FilePlus2 class="size-3.5" />
          Offene Zeiten abrechnen
        </Button>
        {#if billingBlocker}
          <span class="max-w-72 text-xs text-status-warn">{billingBlocker}</span>
        {/if}
      </div>
    {/snippet}
  </Stat>
  <Stat label="Abgerechnet" value="{formatDuration(summary.billedMinutes)} Std" />
</StatRow>
