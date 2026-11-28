<script lang="ts">
  import { link } from "svelte-spa-router";
  import { ArrowRight } from "$lib/brand-icons";
  import { Stat, StatRow } from "$lib/ui";
  import type { CustomerOverview } from "$lib/db/customer-overview";
  import { centsToEur } from "$lib/utils/money";
  import { unbilledTimeHref } from "../../time/time-link";
  import { openInvoicesHint, paymentDaysLabel, unbilledTimeLabel } from "./customer-figures";

  type Props = { overview: CustomerOverview; year: number; customerId: number };
  let { overview, year, customerId }: Props = $props();
</script>

<StatRow>
  <Stat label={`Umsatz ${year}`} value={centsToEur(overview.revenueNet)} hint="netto" />
  <Stat label="Offen" value={centsToEur(overview.openBalance)} hint={openInvoicesHint(overview.openCount)} />
  {#if overview.averagePaymentDays !== null}
    <Stat label="Zahlt im Schnitt nach" value={paymentDaysLabel(overview.averagePaymentDays)} />
  {/if}
  <Stat label="Nicht abgerechnete Zeit" value={unbilledTimeLabel(overview.unbilledMinutes)}>
    {#snippet action()}
      {#if overview.unbilledMinutes > 0}
        <a
          href={unbilledTimeHref(customerId)}
          use:link
          class="group mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Offene Zeiten ansehen
          <ArrowRight class="size-3 transition-transform group-hover:translate-x-0.5" />
        </a>
      {/if}
    {/snippet}
  </Stat>
</StatRow>
