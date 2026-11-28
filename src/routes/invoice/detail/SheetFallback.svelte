<script lang="ts">
  import type { Snippet } from "svelte";
  import type { CustomerSnapshot, InvoiceItem, OfferItem } from "$lib/db/schema";
  import CustomerSnapshotCard from "../CustomerSnapshotCard.svelte";
  import type { Fact } from "./document-facts";
  import LineItemsTable from "../LineItemsTable.svelte";

  type Props = {
    customer: CustomerSnapshot;
    /** The dates the sheet would print. */
    dates: Fact[];
    items: (InvoiceItem | OfferItem)[];
    currency: string;
    showVat: boolean;
    subtotal: number;
    vatAmount: number;
    total: number;
    /** Texts of the document, e.g. payment terms and notes. */
    texts?: Snippet;
  };
  let { customer, dates, items, currency, showVat, subtotal, vatAmount, total, texts }: Props = $props();
</script>

<!-- Shown instead of the sheet when it cannot be rendered, so the document stays readable. -->
<div class="space-y-5">
  <CustomerSnapshotCard {customer} />
  <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
    {#each dates as date (date.label)}
      <dt class="text-muted-foreground">{date.label}</dt>
      <dd class="tabular-nums">{date.value}</dd>
    {/each}
  </dl>
  <LineItemsTable {items} {currency} {showVat} {subtotal} {vatAmount} {total} />
  {@render texts?.()}
</div>
