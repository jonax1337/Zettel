<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Card } from "$lib/ui";
  import type { TaxRücklageResult } from "$lib/dashboard/tax";
  import { centsToEur } from "$lib/utils/money";

  type Props = {
    reserve: TaxRücklageResult | null;
    loading: boolean;
    error: string | null;
  };
  let { reserve, loading, error }: Props = $props();

  const estimated = $derived(reserve?.projected.totalTaxBurdenCent ?? 0);
  const prepaidPercent = $derived(
    reserve && estimated > 0
      ? Math.min(100, Math.max(0, Math.round((reserve.prepaymentsCent / estimated) * 100)))
      : 0,
  );
</script>

<Card class="gap-0 p-5">
  <div class="mb-2.5 flex items-baseline gap-2.5">
    <h2>Steuer-Rücklage</h2>
    <a href="/reports/taxes" use:link class="ml-auto text-[13px] font-semibold text-muted-foreground hover:text-foreground">
      Details
    </a>
  </div>
  {#if error}
    <p class="text-sm text-destructive">Konnte nicht berechnet werden: {error}</p>
  {:else if loading || !reserve}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else}
    <div class="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight tabular-nums">
      {centsToEur(estimated)}
    </div>
    <div class="text-[13px] text-muted-foreground">
      geschätzte Steuerlast {reserve.year}, hochgerechnet (Tarif {reserve.projected.income.tarifYear})
    </div>
    <div
      class="my-4 h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label="{centsToEur(reserve.prepaymentsCent)} von {centsToEur(estimated)} vorausgezahlt"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={prepaidPercent}
    >
      <span class="block h-full rounded-full bg-status-ok" style="width: {prepaidPercent}%"></span>
    </div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px] tabular-nums">
      <dt class="text-muted-foreground">Vorausgezahlt</dt>
      <dd class="text-right font-semibold">{centsToEur(reserve.prepaymentsCent)}</dd>
      <dt class="text-muted-foreground">Noch zurücklegen</dt>
      <dd class="text-right font-semibold">{centsToEur(reserve.projected.recommendedReserveCent)}</dd>
      <dt class="text-muted-foreground">Bisher zurückzulegen</dt>
      <dd class="text-right font-semibold">{centsToEur(reserve.ytd.recommendedReserveCent)}</dd>
      {#if reserve.flags.usePauschal}
        <dt class="text-muted-foreground">Pauschal {reserve.flags.pauschalPercent} %</dt>
        <dd class="text-right font-semibold">{centsToEur(reserve.pauschalReserveCent)}</dd>
      {/if}
    </dl>
  {/if}
</Card>
