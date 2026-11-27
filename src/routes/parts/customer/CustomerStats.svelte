<script lang="ts">
  import { Stat, StatRow } from "$lib/ui";
  import type { CustomerOverview } from "$lib/db/customer-overview";
  import { centsToEur } from "$lib/utils/money";
  import { openInvoicesHint, paymentDaysLabel, unbilledTimeLabel } from "./customer-figures";

  type Props = { overview: CustomerOverview; year: number };
  let { overview, year }: Props = $props();
</script>

<StatRow>
  <Stat label={`Umsatz ${year}`} value={centsToEur(overview.revenueNet)} hint="netto" />
  <Stat label="Offen" value={centsToEur(overview.openBalance)} hint={openInvoicesHint(overview.openCount)} />
  {#if overview.averagePaymentDays !== null}
    <Stat label="Zahlt im Schnitt nach" value={paymentDaysLabel(overview.averagePaymentDays)} />
  {/if}
  <Stat label="Nicht abgerechnete Zeit" value={unbilledTimeLabel(overview.unbilledMinutes)} />
</StatRow>
