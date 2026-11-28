<script lang="ts">
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

<table class="data-list text-sm">
  <thead>
    <tr>
      <th class="w-12">#</th>
      <th>Beschreibung</th>
      <th class="w-20 text-right">Menge</th>
      <th class="w-20">Einheit</th>
      <th class="w-28 text-right">Preis</th>
      {#if showVat}
        <th class="w-16 text-right">USt %</th>
      {/if}
      <th class="w-28 text-right">Summe</th>
    </tr>
  </thead>
  <tbody>
    {#each items as it (it.id)}
      <tr class="align-top">
        <td class="py-3 text-xs text-muted-foreground">{it.position}</td>
        <td class="py-3">
          <div>{it.description}</div>
          {#if it.longDescription}
            <div class="mt-0.5 text-xs whitespace-pre-wrap text-muted-foreground">{it.longDescription}</div>
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
        <td class="py-3 text-right tabular-nums">{it.quantity}</td>
        <td class="py-3">{it.unit}</td>
        <td class="py-3 text-right tabular-nums">{formatMoney(it.unitPrice, currency)}</td>
        {#if showVat}
          <td class="py-3 text-right tabular-nums">{it.vatRate}</td>
        {/if}
        <td class="py-3 text-right tabular-nums">{formatMoney(it.lineTotal, currency)}</td>
      </tr>
    {/each}
  </tbody>
  <tfoot class="text-sm tabular-nums">
    <tr>
      <td colspan={labelColspan} class="h-9 text-right text-muted-foreground">Zwischensumme</td>
      <td class="h-9 text-right">{formatMoney(subtotal, currency)}</td>
    </tr>
    {#if showVat}
      <tr>
        <td colspan={labelColspan} class="h-9 text-right text-muted-foreground">USt</td>
        <td class="h-9 text-right">{formatMoney(vatAmount, currency)}</td>
      </tr>
    {/if}
    <tr>
      <td colspan={labelColspan} class="h-11 text-right font-extrabold">Gesamtbetrag</td>
      <td class="h-11 text-right font-extrabold">{formatMoney(total, currency)}</td>
    </tr>
  </tfoot>
</table>
