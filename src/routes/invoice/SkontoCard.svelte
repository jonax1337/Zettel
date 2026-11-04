<script lang="ts">
  import { Badge, Card, CardContent } from "$lib/ui";
  import type { Invoice } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import { computeSkonto } from "$lib/utils/skonto";

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
  <Card class="mb-6 border-primary/30">
    <CardContent class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Skonto</h3>
        <p class="text-sm mt-1">
          {skonto.percent} % bei Zahlung bis
          <strong>{formatDate(skonto.deadlineUnix)}</strong>
          — Rabatt
          <strong>{formatMoney(skonto.discountCent, invoice.currency)}</strong>
        </p>
      </div>
      <Badge variant={stillValid ? "success" : "outline"} class="shrink-0">{badgeLabel}</Badge>
    </CardContent>
  </Card>
{/if}
