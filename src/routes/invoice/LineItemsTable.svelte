<script lang="ts">
  import { Card } from "$lib/ui";
  import type { InvoiceItem, OfferItem } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";

  type Props = {
    items: (InvoiceItem | OfferItem)[];
    currency: string;
    /** False for Kleinunternehmer documents, which carry no VAT columns. */
    showVat: boolean;
    subtotal: number;
    vatAmount: number;
    total: number;
  };
  let { items, currency, showVat, subtotal, vatAmount, total }: Props = $props();

  // Number of columns left of the "Summe" column.
  const labelColspan = $derived(showVat ? 6 : 5);
</script>

<Card class="overflow-hidden mb-6">
  <table class="w-full text-sm">
    <thead class="bg-muted/40 text-left">
      <tr class="text-xs uppercase tracking-wider text-muted-foreground">
        <th class="px-4 py-3 font-medium w-12">#</th>
        <th class="px-4 py-3 font-medium">Beschreibung</th>
        <th class="px-4 py-3 font-medium text-right w-20">Menge</th>
        <th class="px-4 py-3 font-medium w-20">Einheit</th>
        <th class="px-4 py-3 font-medium text-right w-28">Preis</th>
        {#if showVat}
          <th class="px-4 py-3 font-medium text-right w-16">USt%</th>
        {/if}
        <th class="px-4 py-3 font-medium text-right w-28">Summe</th>
      </tr>
    </thead>
    <tbody>
      {#each items as it (it.id)}
        <tr class="border-t border-border">
          <td class="px-4 py-3 text-xs text-muted-foreground align-top">{it.position}</td>
          <td class="px-4 py-3 align-top">
            <div>{it.description}</div>
            {#if it.longDescription}
              <div class="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">{it.longDescription}</div>
            {/if}
            {#if it.linePeriodStart && it.linePeriodEnd}
              <div class="mt-0.5 text-xs text-muted-foreground italic">
                {#if it.linePeriodStart === it.linePeriodEnd}
                  Leistungsdatum {formatDate(it.linePeriodStart)}
                {:else}
                  Leistungszeitraum {formatDate(it.linePeriodStart)} – {formatDate(it.linePeriodEnd)}
                {/if}
              </div>
            {/if}
          </td>
          <td class="px-4 py-3 text-right align-top">{it.quantity}</td>
          <td class="px-4 py-3 align-top">{it.unit}</td>
          <td class="px-4 py-3 text-right font-mono align-top">{formatMoney(it.unitPrice, currency)}</td>
          {#if showVat}
            <td class="px-4 py-3 text-right align-top">{it.vatRate}</td>
          {/if}
          <td class="px-4 py-3 text-right font-mono align-top">{formatMoney(it.lineTotal, currency)}</td>
        </tr>
      {/each}
    </tbody>
    <tfoot class="bg-muted/40">
      <tr class="border-t border-border">
        <td colspan={labelColspan} class="px-4 py-2 text-right text-muted-foreground">Zwischensumme</td>
        <td class="px-4 py-2 text-right font-mono">{formatMoney(subtotal, currency)}</td>
      </tr>
      {#if showVat}
        <tr>
          <td colspan={labelColspan} class="px-4 py-2 text-right text-muted-foreground">USt</td>
          <td class="px-4 py-2 text-right font-mono">{formatMoney(vatAmount, currency)}</td>
        </tr>
      {/if}
      <tr class="border-t border-border">
        <td colspan={labelColspan} class="px-4 py-3 text-right font-semibold">Gesamtbetrag</td>
        <td class="px-4 py-3 text-right font-mono font-semibold">{formatMoney(total, currency)}</td>
      </tr>
    </tfoot>
  </table>
</Card>
