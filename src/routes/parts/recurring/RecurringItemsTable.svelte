<script lang="ts">
  import { computeLineTotal } from "$lib/utils/totals";
  import { centsToEur } from "$lib/utils/money";
  import { Button, Card, Input, LinePeriodPopover, Select, Textarea } from "$lib/ui";
  import { FileText, Package, Plus, Trash2, X } from "$lib/brand-icons";
  import { commitPriceText } from "../entity/format";
  import { VAT_RATE_ITEMS } from "../entity/vat";
  import type { RecurringItemRow } from "./recurring-items";

  type Props = {
    items: RecurringItemRow[];
    vatExempt: boolean;
    totalCents: number;
    onAdd: () => void;
    onAddFromCatalog: () => void;
  };
  let { items = $bindable(), vatExempt, totalCents, onAdd, onAddFromCatalog }: Props = $props();

  const detailButtonClass =
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-input bg-transparent px-2 h-7 text-xs text-muted-foreground hover:bg-accent transition-colors cursor-pointer";

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }

  function hideDetail(item: RecurringItemRow) {
    item.showDetail = false;
    item.longDescription = "";
  }
</script>

<section>
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
      Positionen
    </h2>
    <div class="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" onclick={onAddFromCatalog}>
        <Package />
        Aus Katalog…
      </Button>
      <Button type="button" size="sm" variant="outline" onclick={onAdd}>
        <Plus />
        Position
      </Button>
    </div>
  </div>
  <Card class="overflow-hidden py-0">
    <table class="w-full table-fixed text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          <th class="px-1.5 @3xl:px-3 py-2 w-8 @3xl:w-10 font-medium">#</th>
          <th class="px-1.5 @3xl:px-3 py-2 font-medium">Beschreibung</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-[4.25rem] @3xl:w-20 font-medium">Menge</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-[4.5rem] @3xl:w-20 font-medium">Einheit</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-20 @3xl:w-28 font-medium">Preis<span class="hidden @3xl:inline"> (€)</span></th>
          {#if !vatExempt}
            <th class="px-1.5 @3xl:px-3 py-2 w-16 @3xl:w-24 font-medium">USt</th>
          {/if}
          <th class="px-1.5 @3xl:px-3 py-2 w-24 @3xl:w-28 font-medium text-right">Summe</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-10 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {#each items as item, idx (idx)}
          <tr class="border-t">
            <td class="px-1.5 @3xl:px-3 py-2 text-xs text-muted-foreground align-top pt-3">{idx + 1}</td>
            <td class="px-1.5 @3xl:px-2 py-1.5">
              <Input bind:value={item.description} required />
              {#if item.showDetail}
                <div class="mt-1.5">
                  <Textarea rows={2} placeholder="Detail-Beschreibung" bind:value={item.longDescription} />
                </div>
              {/if}
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <LinePeriodPopover bind:startIso={item.periodStartIso} bind:endIso={item.periodEndIso} />
                {#if item.showDetail}
                  <button
                    type="button"
                    class="{detailButtonClass} hover:text-destructive"
                    title="Detail entfernen"
                    onclick={() => hideDetail(item)}
                  >
                    <X class="size-3" /> <span class="sr-only @2xl:not-sr-only">Detail entfernen</span>
                  </button>
                {:else}
                  <button
                    type="button"
                    class="{detailButtonClass} hover:text-foreground"
                    title="Detail-Beschreibung hinzufügen"
                    onclick={() => (item.showDetail = true)}
                  >
                    <FileText class="size-3" /> <span class="sr-only @2xl:not-sr-only">Detail-Beschreibung</span>
                  </button>
                {/if}
              </div>
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5 align-top pt-1.5">
              <Input
                type="number"
                step="0.01"
                min="0"
                bind:value={item.quantity}
                class="px-2 @3xl:px-3 [&::-webkit-inner-spin-button]:appearance-none @3xl:[&::-webkit-inner-spin-button]:appearance-auto"
              />
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5 align-top pt-1.5"><Input bind:value={item.unit} class="px-2 @3xl:px-3" /></td>
            <td class="px-1.5 @3xl:px-2 py-1.5 align-top pt-1.5">
              <Input
                bind:value={item.priceText}
                onblur={() => commitPriceText(item)}
                placeholder="0,00"
                class="px-2 @3xl:px-3 text-right"
              />
            </td>
            {#if !vatExempt}
              <td class="px-1.5 @3xl:px-2 py-1.5 align-top pt-1.5">
                <Select
                  bind:value={() => String(item.vatRate), (v) => (item.vatRate = Number.parseInt(v, 10))}
                  items={VAT_RATE_ITEMS}
                  class="px-2 @3xl:px-3"
                />
              </td>
            {/if}
            <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono text-xs whitespace-nowrap align-top pt-3">
              {centsToEur(computeLineTotal(item))}
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5 text-right align-top pt-1.5">
              <button
                type="button"
                onclick={() => removeItem(idx)}
                disabled={items.length === 1}
                class="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Position entfernen"
              >
                <Trash2 class="size-4" />
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="bg-muted/40 text-sm">
        <tr class="border-t">
          <td colspan={vatExempt ? 5 : 6} class="px-1.5 @3xl:px-3 py-2 text-right font-semibold">
            Voraussichtlicher Gesamtbetrag pro Erzeugung
          </td>
          <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono text-xs @3xl:text-sm font-semibold whitespace-nowrap">{centsToEur(totalCents)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </Card>
</section>
