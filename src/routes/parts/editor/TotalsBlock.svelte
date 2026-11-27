<script lang="ts">
  import { formatMoney } from "$lib/utils/currency";
  import type { Totals } from "$lib/utils/totals";

  type Props = {
    totals: Totals;
    currency: string;
    /** Kleinunternehmer and reverse charge documents carry no VAT line. */
    vatExempt: boolean;
    totalLabel?: string;
    /** Explains why there is no VAT line. */
    vatNote?: string | null;
  };
  let { totals, currency, vatExempt, totalLabel = "Gesamtbetrag", vatNote = null }: Props = $props();
</script>

<div class="ml-auto mt-4 w-full max-w-[20rem] tabular-nums">
  <div class="flex justify-between gap-4 py-1 text-foreground/80">
    <span>Zwischensumme</span>
    <span>{formatMoney(totals.subtotal, currency)}</span>
  </div>
  {#if !vatExempt}
    <div class="flex justify-between gap-4 py-1 text-foreground/80">
      <span>Umsatzsteuer</span>
      <span>{formatMoney(totals.vatAmount, currency)}</span>
    </div>
  {:else if vatNote}
    <p class="py-1 text-right text-xs text-muted-foreground">{vatNote}</p>
  {/if}
  <div class="mt-1.5 flex justify-between gap-4 border-t-[1.5px] border-foreground pt-2.5 font-display text-lg font-extrabold">
    <span>{totalLabel}</span>
    <span>{formatMoney(totals.total, currency)}</span>
  </div>
</div>
