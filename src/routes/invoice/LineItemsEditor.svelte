<script lang="ts">
  import { tick } from "svelte";
  import { flip } from "svelte/animate";
  import { Button, Card, CatalogPicker, Input, LinePeriodPopover, Select, Textarea } from "$lib/ui";
  import {
    ChevronDown,
    ChevronUp,
    FileText,
    GripVertical,
    Package,
    Plus,
    Trash2,
    X,
  } from "$lib/brand-icons";
  import type { CatalogItem } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { computeLineTotal, type Totals } from "$lib/utils/totals";
  import {
    lineItemFromCatalog,
    moveLineItem,
    newLineItem,
    type LineItemForm,
  } from "./line-items";
  import { commitPriceText } from "../parts/entity/format";
  import { VAT_RATE_ITEMS, vatRateForNewItem } from "../parts/entity/vat";

  type Props = {
    items: LineItemForm[];
    currency: string;
    vatExempt: boolean;
    totals: Totals;
    language: "de" | "en";
    readOnly?: boolean;
  };
  let {
    items = $bindable(),
    currency,
    vatExempt,
    totals,
    language,
    readOnly = false,
  }: Props = $props();

  const subtleButton =
    "inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md border border-input bg-transparent px-2 h-7 text-xs text-muted-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

  // Number of columns left of the "Summe" column; the VAT column is hidden when exempt.
  const labelColspan = $derived(vatExempt ? 5 : 6);

  let catalogPickerOpen = $state(false);
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let tableElement = $state<HTMLTableElement>();

  function addItem() {
    const added = newLineItem(vatRateForNewItem(vatExempt));
    items = [...items, added];
    void focusDescription(added.uid);
  }

  async function focusDescription(uid: number) {
    await tick();
    tableElement?.querySelector<HTMLInputElement>(`[data-line-description="${uid}"]`)?.focus();
  }

  function addFromCatalog(catalogItem: CatalogItem) {
    items = [...items, lineItemFromCatalog(catalogItem, { vatExempt, language })];
  }

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }

  function moveItem(from: number, to: number) {
    if (readOnly) return;
    items = moveLineItem(items, from, to);
  }

  function onDragStart(idx: number) {
    if (!readOnly) dragIndex = idx;
  }

  function onDragOver(e: DragEvent, idx: number) {
    if (readOnly) return;
    e.preventDefault();
    dragOverIndex = idx;
  }

  function onDrop(idx: number) {
    if (dragIndex !== null) moveItem(dragIndex, idx);
    onDragEnd();
  }

  function onDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }
</script>

<section>
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider">Positionen</h2>
    <div class="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" onclick={() => (catalogPickerOpen = true)} disabled={readOnly}>
        <Package />
        Aus Katalog…
      </Button>
      <Button type="button" size="sm" variant="outline" onclick={addItem} disabled={readOnly}>
        <Plus />
        Position
      </Button>
    </div>
  </div>
  <Card class="overflow-hidden py-0">
    <table bind:this={tableElement} class="w-full table-fixed text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
          <th class="px-1.5 @3xl:px-3 py-2 w-10 @3xl:w-14 font-medium">#</th>
          <th class="px-1.5 @3xl:px-3 py-2 font-medium">Beschreibung</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-[4.25rem] @3xl:w-20 font-medium">Menge</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-[4.5rem] @3xl:w-20 font-medium">Einheit</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-20 @3xl:w-28 font-medium" title="Preis ({currency})">Preis<span class="hidden @3xl:inline"> ({currency})</span></th>
          {#if !vatExempt}
            <th class="px-1.5 @3xl:px-3 py-2 w-16 @3xl:w-24 font-medium">USt</th>
          {/if}
          <th class="px-1.5 @3xl:px-3 py-2 w-24 @3xl:w-28 font-medium text-right">Summe</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-16 @3xl:w-24 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {#each items as it, idx (it.uid)}
          <tr
            class="border-t {dragOverIndex === idx && dragIndex !== idx ? 'bg-accent/40' : ''}"
            class:opacity-50={dragIndex === idx}
            animate:flip={{ duration: 150 }}
            ondragover={(e) => onDragOver(e, idx)}
            ondrop={() => onDrop(idx)}
          >
            <td class="px-1.5 @3xl:px-2 py-2 align-top">
              <div class="flex items-center gap-0.5 @3xl:gap-1">
                <button
                  type="button"
                  draggable={!readOnly}
                  ondragstart={() => onDragStart(idx)}
                  ondragend={onDragEnd}
                  disabled={readOnly}
                  class="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-foreground disabled:opacity-30 disabled:cursor-default transition-colors"
                  title="Ziehen zum Sortieren"
                  aria-label="Position verschieben"
                >
                  <GripVertical class="size-4" />
                </button>
                <span class="text-xs text-muted-foreground tabular-nums">{idx + 1}</span>
              </div>
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5">
              <Input bind:value={it.description} data-line-description={it.uid} required disabled={readOnly} />
              {#if it.showDetail}
                <div class="mt-1.5">
                  <Textarea
                    rows={2}
                    placeholder="Detail-Beschreibung — z. B. Sub-Leistungen, Spezifikation"
                    bind:value={it.longDescription}
                    disabled={readOnly}
                  />
                </div>
              {/if}
              <div class="mt-1.5 flex flex-wrap gap-1.5">
                <LinePeriodPopover
                  bind:startIso={it.periodStartIso}
                  bind:endIso={it.periodEndIso}
                  disabled={readOnly}
                />
                {#if it.showDetail}
                  <button
                    type="button"
                    class="{subtleButton} hover:bg-accent hover:text-destructive"
                    title="Detail entfernen"
                    onclick={() => {
                      it.showDetail = false;
                      it.longDescription = "";
                    }}
                    disabled={readOnly}
                  >
                    <X class="size-3" /> <span class="sr-only @2xl:not-sr-only">Detail entfernen</span>
                  </button>
                {:else}
                  <button
                    type="button"
                    class="{subtleButton} hover:bg-accent hover:text-foreground"
                    title="Detail-Beschreibung hinzufügen"
                    onclick={() => (it.showDetail = true)}
                    disabled={readOnly}
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
                bind:value={it.quantity}
                disabled={readOnly}
                class="px-2 @3xl:px-3 [&::-webkit-inner-spin-button]:appearance-none @3xl:[&::-webkit-inner-spin-button]:appearance-auto"
              />
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5 align-top pt-1.5">
              <Input bind:value={it.unit} disabled={readOnly} class="px-2 @3xl:px-3" />
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5 align-top pt-1.5">
              <Input
                bind:value={it.priceText}
                onblur={() => commitPriceText(it)}
                placeholder="0,00"
                class="px-2 @3xl:px-3 text-right"
                disabled={readOnly}
              />
            </td>
            {#if !vatExempt}
              <td class="px-1.5 @3xl:px-2 py-1.5 align-top pt-1.5">
                <Select
                  bind:value={() => String(it.vatRate), (v) => (it.vatRate = Number.parseInt(v, 10))}
                  items={VAT_RATE_ITEMS}
                  disabled={readOnly}
                  class="px-2 @3xl:px-3"
                />
              </td>
            {/if}
            <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono text-xs whitespace-nowrap align-top pt-3">
              {formatMoney(computeLineTotal(it), currency)}
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5 text-right align-top pt-1.5">
              <div class="inline-flex items-center gap-0.5">
                <div class="flex flex-col">
                  <button
                    type="button"
                    onclick={() => moveItem(idx, idx - 1)}
                    disabled={idx === 0 || readOnly}
                    class="inline-flex items-center justify-center size-5 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20 disabled:pointer-events-none transition-colors"
                    title="Nach oben"
                    aria-label="Position nach oben"
                  >
                    <ChevronUp class="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onclick={() => moveItem(idx, idx + 1)}
                    disabled={idx === items.length - 1 || readOnly}
                    class="inline-flex items-center justify-center size-5 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-20 disabled:pointer-events-none transition-colors"
                    title="Nach unten"
                    aria-label="Position nach unten"
                  >
                    <ChevronDown class="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onclick={() => removeItem(idx)}
                  disabled={items.length === 1 || readOnly}
                  class="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Position entfernen"
                  aria-label="Position {idx + 1} entfernen"
                >
                  <Trash2 class="size-4" />
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="bg-muted/40 text-sm">
        <tr class="border-t">
          <td colspan={labelColspan} class="px-1.5 @3xl:px-3 py-2 text-right text-muted-foreground">Zwischensumme</td>
          <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono text-xs @3xl:text-sm whitespace-nowrap">{formatMoney(totals.subtotal, currency)}</td>
          <td></td>
        </tr>
        {#if !vatExempt}
          <tr>
            <td colspan={labelColspan} class="px-1.5 @3xl:px-3 py-2 text-right text-muted-foreground">USt</td>
            <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono text-xs @3xl:text-sm whitespace-nowrap">{formatMoney(totals.vatAmount, currency)}</td>
            <td></td>
          </tr>
        {/if}
        <tr class="border-t">
          <td colspan={labelColspan} class="px-1.5 @3xl:px-3 py-2 text-right font-semibold">Gesamtbetrag</td>
          <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono text-xs @3xl:text-sm font-semibold whitespace-nowrap">{formatMoney(totals.total, currency)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </Card>
</section>

<CatalogPicker bind:open={catalogPickerOpen} onPick={addFromCatalog} {language} />
