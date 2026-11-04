<script lang="ts">
  import { Badge, Card, CardContent } from "$lib/ui";
  import type { Invoice } from "$lib/db/schema";
  import { formatDate } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
  import { SUPPLY_KIND_LABEL } from "./supply-kind";

  let { invoice }: { invoice: Invoice } = $props();

  const isForeignCurrency = $derived(!!invoice.currency && invoice.currency !== "EUR");
</script>

<Card>
  <CardContent>
    <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">Eckdaten</h2>
    <dl class="text-sm grid grid-cols-2 gap-y-1.5">
      <dt class="text-muted-foreground">{invoice.isCreditNote ? "Stornodatum" : "Rechnungsdatum"}</dt>
      <dd>{formatDate(invoice.issueDate)}</dd>
      {#if !invoice.isCreditNote}
        <dt class="text-muted-foreground">Fällig am</dt>
        <dd>{formatDate(invoice.dueDate)}</dd>
      {/if}
      {#if invoice.servicePeriodStart && invoice.servicePeriodEnd}
        <dt class="text-muted-foreground">Leistungszeitraum</dt>
        <dd>{formatDate(invoice.servicePeriodStart)} – {formatDate(invoice.servicePeriodEnd)}</dd>
      {:else if invoice.deliveryDate}
        <dt class="text-muted-foreground">Leistungsdatum</dt>
        <dd>{formatDate(invoice.deliveryDate)}</dd>
      {/if}
      {#if invoice.reverseChargeType !== "none"}
        <dt class="text-muted-foreground">Art des Umsatzes</dt>
        <dd>{SUPPLY_KIND_LABEL[invoice.supplyKind]}</dd>
      {/if}
      {#if invoice.sentAt}
        <dt class="text-muted-foreground">Versendet</dt>
        <dd>{formatDate(invoice.sentAt)}</dd>
      {/if}
      {#if invoice.paidAt}
        <dt class="text-muted-foreground">Bezahlt</dt>
        <dd>{formatDate(invoice.paidAt)}</dd>
      {/if}
      {#if isForeignCurrency}
        <dt class="text-muted-foreground">Währung</dt>
        <dd><Badge variant="outline">{invoice.currency}</Badge></dd>
        {#if invoice.exchangeRate}
          <dt class="text-muted-foreground">Wechselkurs</dt>
          <dd class="font-mono">1 EUR = {invoice.exchangeRate} {invoice.currency}</dd>
        {/if}
        {#if invoice.eurTotalCent != null}
          <dt class="text-muted-foreground">Gesamt (EUR)</dt>
          <dd class="font-mono">{centsToEur(invoice.eurTotalCent)}</dd>
        {/if}
      {/if}
    </dl>
  </CardContent>
</Card>
