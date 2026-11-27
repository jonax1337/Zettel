<script lang="ts">
  import { Card } from "$lib/ui";
  import { centsToEur } from "$lib/utils/money";
  import type { TaxRücklageResult, TaxScenario } from "$lib/dashboard/tax";
  import { prepaymentStatus } from "./reserve-summary";

  type Props = {
    result: TaxRücklageResult;
    scenario: TaxScenario;
  };

  let { result, scenario }: Props = $props();

  const prepayments = $derived(prepaymentStatus(scenario.totalTaxBurdenCent, result.prepaymentsCent));
</script>

<Card class="gap-0 px-6 py-6">
  <div class="text-[13px] font-semibold text-muted-foreground">Noch zurücklegen</div>
  <div class="mt-1.5 font-display text-[44px] leading-[1.1] font-extrabold tracking-tight tabular-nums">
    {centsToEur(scenario.recommendedReserveCent)}
  </div>
  {#if prepayments.kind === "against-burden"}
    <div
      class="my-4 h-2 overflow-hidden rounded-full bg-status-calm-bg"
      role="img"
      aria-label="{centsToEur(result.prepaymentsCent)} von {centsToEur(scenario.totalTaxBurdenCent)} vorausgezahlt"
    >
      <span class="block h-full rounded-full bg-status-ok" style="width: {prepayments.percent}%"></span>
    </div>
    <p class="text-[13px] text-muted-foreground tabular-nums">
      {centsToEur(result.prepaymentsCent)} von {centsToEur(scenario.totalTaxBurdenCent)} sind schon als Vorauszahlung geleistet.
    </p>
  {:else if prepayments.kind === "no-burden"}
    <p class="mt-3 text-[13px] text-muted-foreground">
      Nach dieser Schätzung fällt für {result.year} keine Steuer an. Deine Vorauszahlungen von
      {centsToEur(result.prepaymentsCent)} wären zu viel gezahlt.
    </p>
  {:else}
    <p class="mt-3 text-[13px] text-muted-foreground">Es sind keine Vorauszahlungen für {result.year} erfasst.</p>
  {/if}
</Card>
