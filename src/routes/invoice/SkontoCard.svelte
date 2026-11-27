<script lang="ts">
  import { Badge } from "$lib/ui";
  import type { Invoice } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import { computeSkonto } from "$lib/utils/skonto";
  import DetailPanel from "./detail/DetailPanel.svelte";

  let { invoice }: { invoice: Invoice } = $props();

  const skonto = $derived(
    computeSkonto({
      totalCent: Math.abs(invoice.total),
      percent: invoice.skontoPercent,
      days: invoice.skontoDays,
      issueDate: invoice.issueDate,
      isCreditNote: invoice.isCreditNote,
    }),
  );

  const stillValid = $derived(
    !!skonto && invoice.status === "sent" && skonto.deadlineUnix * 1000 >= Date.now(),
  );
  const badgeLabel = $derived(
    stillValid ? "noch gültig" : invoice.status === "paid" ? "Rechnung bezahlt" : "abgelaufen",
  );
</script>

{#if skonto}
  <DetailPanel title="Skonto">
    <div class="flex items-start justify-between gap-3">
      <p class="text-sm">
        {skonto.percent} % bei Zahlung bis
        <strong>{formatDate(skonto.deadlineUnix)}</strong>, Rabatt
        <strong>{formatMoney(skonto.discountCent, invoice.currency)}</strong>
      </p>
      <Badge variant={stillValid ? "paid" : "calm"} class="shrink-0">{badgeLabel}</Badge>
    </div>
  </DetailPanel>
{/if}
