<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, CardContent } from "$lib/ui";
  import { ArrowRight } from "$lib/brand-icons";
  import type { TaxRücklageResult } from "$lib/dashboard/tax";
  import { centsToEur } from "$lib/utils/money";

  type Props = { reserve: TaxRücklageResult };
  let { reserve }: Props = $props();
</script>

<button type="button" onclick={() => push("/reports/taxes")} class="block w-full text-left mb-6 group">
  <Card class="cursor-pointer hover:bg-muted/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
    <CardContent>
      <div class="flex items-center justify-between gap-6">
        <div class="min-w-0">
          <div class="text-xs text-muted-foreground uppercase tracking-wider">
            Steuer-Rücklage {reserve.year} · Tarif {reserve.projected.income.tarifYear}
          </div>
          <div class="flex items-baseline gap-6 mt-0.5">
            <div>
              <div class="text-2xl font-semibold tabular-nums">
                {centsToEur(reserve.ytd.recommendedReserveCent)}
              </div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wider">YTD</div>
            </div>
            <div>
              <div class="text-2xl font-semibold tabular-nums text-muted-foreground">
                {centsToEur(reserve.projected.recommendedReserveCent)}
              </div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Hochgerechnet</div>
            </div>
            {#if reserve.flags.usePauschal}
              <div>
                <div class="text-2xl font-semibold tabular-nums text-muted-foreground">
                  {centsToEur(reserve.pauschalReserveCent)}
                </div>
                <div class="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Pauschal {reserve.flags.pauschalPercent}%
                </div>
              </div>
            {/if}
          </div>
        </div>
        <div class="inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
          Details
          <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </CardContent>
  </Card>
</button>
