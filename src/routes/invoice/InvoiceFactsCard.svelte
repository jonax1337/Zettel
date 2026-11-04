<script lang="ts">
  import { Badge } from "$lib/ui";
  import type { Invoice } from "$lib/db/schema";
  import { formatDate } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
  import DocumentFactsCard from "../parts/entity/DocumentFactsCard.svelte";
  import FactRow from "../parts/entity/FactRow.svelte";
  import { SUPPLY_KIND_LABEL } from "./supply-kind";

  let { invoice }: { invoice: Invoice } = $props();

  const isForeignCurrency = $derived(!!invoice.currency && invoice.currency !== "EUR");
</script>

<DocumentFactsCard>
  <FactRow label={invoice.isCreditNote ? "Stornodatum" : "Rechnungsdatum"}>{formatDate(invoice.issueDate)}</FactRow>
  {#if !invoice.isCreditNote}
    <FactRow label="Fällig am">{formatDate(invoice.dueDate)}</FactRow>
  {/if}
  {#if invoice.servicePeriodStart && invoice.servicePeriodEnd}
    <FactRow label="Leistungszeitraum">
      {formatDate(invoice.servicePeriodStart)} – {formatDate(invoice.servicePeriodEnd)}
    </FactRow>
  {:else if invoice.deliveryDate}
    <FactRow label="Leistungsdatum">{formatDate(invoice.deliveryDate)}</FactRow>
  {/if}
  {#if invoice.reverseChargeType !== "none"}
    <FactRow label="Art des Umsatzes">{SUPPLY_KIND_LABEL[invoice.supplyKind]}</FactRow>
  {/if}
  {#if invoice.sentAt}
    <FactRow label="Versendet">{formatDate(invoice.sentAt)}</FactRow>
  {/if}
  {#if invoice.paidAt}
    <FactRow label="Bezahlt">{formatDate(invoice.paidAt)}</FactRow>
  {/if}
  {#if isForeignCurrency}
    <FactRow label="Währung"><Badge variant="outline">{invoice.currency}</Badge></FactRow>
    {#if invoice.exchangeRate}
      <FactRow label="Wechselkurs">
        <span class="font-mono">1 EUR = {invoice.exchangeRate} {invoice.currency}</span>
      </FactRow>
    {/if}
    {#if invoice.eurTotalCent != null}
      <FactRow label="Gesamt (EUR)"><span class="font-mono">{centsToEur(invoice.eurTotalCent)}</span></FactRow>
    {/if}
  {/if}
</DocumentFactsCard>
