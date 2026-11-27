<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import { flip } from "svelte/animate";
  import { Button, CatalogPicker, Input, LinePeriodPopover, Select, Textarea } from "$lib/ui";
  import { ChevronDown, ChevronUp, FileText, GripVertical, Package, Plus, Trash2, X } from "$lib/brand-icons";
  import type { CatalogItem } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { fromIsoDate } from "$lib/utils/date";
  import { computeLineTotal, type Totals } from "$lib/utils/totals";
  import { VAT_RATE_ITEMS, vatRateForNewItem } from "$lib/utils/vat";
  import { commitPriceText } from "../entity/format";
  import {
    lineItemFromCatalog,
    moveLineItem,
    newLineItem,
    toTotalsItem,
    type LineItemForm,
  } from "../../invoice/line-items";
  import FieldError from "./FieldError.svelte";
  import TotalsBlock from "./TotalsBlock.svelte";
  import { CELL_FIELD } from "./quiet-field";
  import { keepsSavedAmount, SAVED_AMOUNTS_HINT } from "./stored-amounts";

  type Props = {
    items: LineItemForm[];
    currency: string;
    vatExempt: boolean;
    totals: Totals;
    language: "de" | "en";
    readOnly?: boolean;
    totalLabel?: string;
    vatNote?: string | null;
    /** Further quiet actions next to "Position" and "Aus Katalog". */
    actions?: Snippet;
    /** Messages for the table; the first one found is shown under it. */
    errors?: { items?: string; quantity?: string; linePeriod?: string };
  };
  let {
    items = $bindable(),
    currency,
    vatExempt,
    totals,
    language,
    readOnly = false,
    totalLabel,
    vatNote = null,
    errors = {},
    actions,
  }: Props = $props();

  /** Below this width of the table the quantity, price and amount move into a second line. */
  const COMPACT_BELOW_PX = 700;

  const detailButton =
    "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground transition-colors hover:border-input hover:text-foreground disabled:opacity-50";
  const moveButton =
    "inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-20";

  const ERROR_ID = "line-items-error";

  let width = $state(0);
  const compact = $derived(width > 0 && width < COMPACT_BELOW_PX);
  let catalogPickerOpen = $state(false);
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let listElement = $state<HTMLDivElement>();

  const hasSavedAmounts = $derived(items.some(keepsSavedAmount));
  const shownError = $derived(errors.items ?? errors.quantity ?? errors.linePeriod);

  // The message sits below the table, so the controls it is about carry the invalid mark.
  function descriptionInvalid(item: LineItemForm, idx: number): boolean {
    const reversedPeriod =
      !!item.periodStartIso && !!item.periodEndIso && fromIsoDate(item.periodEndIso) < fromIsoDate(item.periodStartIso);
    return (!!errors.items && idx === 0) || (!!errors.linePeriod && reversedPeriod);
  }

  function quantityInvalid(item: LineItemForm): boolean {
    return !!errors.quantity && !Number.isFinite(item.quantity);
  }

  function addItem() {
    const added = newLineItem(vatRateForNewItem(vatExempt));
    items = [...items, added];
    void focusDescription(added.uid);
  }

  async function focusDescription(uid: number) {
    await tick();
    listElement?.querySelector<HTMLInputElement>(`[data-line-description="${uid}"]`)?.focus();
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

<div class="lines" class:compact class:exempt={vatExempt} bind:clientWidth={width} bind:this={listElement}>
  {#if !compact}
    <div class="line head" aria-hidden="true">
      <span class="a-desc">Leistung</span>
      <span class="a-qty r">Menge</span>
      <span class="a-unit">Einheit</span>
      <span class="a-price r">{currency === "EUR" ? "Einzelpreis" : `Preis (${currency})`}</span>
      {#if !vatExempt}<span class="a-vat r">USt</span>{/if}
      <span class="a-amount r">Betrag</span>
    </div>
  {/if}

  {#each items as it, idx (it.uid)}
    <div
      class="line"
      class:dragged={dragIndex === idx}
      class:drop-target={dragOverIndex === idx && dragIndex !== idx}
      role="group"
      aria-label="Position {idx + 1}"
      animate:flip={{ duration: 150 }}
      ondragover={(e) => onDragOver(e, idx)}
      ondrop={() => onDrop(idx)}
    >
      <!-- Pointer-only: the labelled buttons "nach oben" and "nach unten" move a position by keyboard. -->
      <div class="a-handle handle" aria-hidden="true">
        <span
          class="grip"
          role="presentation"
          class:locked={readOnly}
          draggable={!readOnly}
          ondragstart={() => onDragStart(idx)}
          ondragend={onDragEnd}
          title="Ziehen zum Sortieren"
        >
          <GripVertical class="size-4" />
        </span>
        <span class="num">{idx + 1}</span>
      </div>

      <div class="a-desc">
        <Input
          bind:value={it.description}
          data-line-description={it.uid}
          aria-label="Leistung der Position {idx + 1}"
          aria-invalid={descriptionInvalid(it, idx) || undefined}
          aria-describedby={descriptionInvalid(it, idx) ? ERROR_ID : undefined}
          placeholder="Leistung"
          required
          disabled={readOnly}
          class={CELL_FIELD}
        />
      </div>

      <div class="a-qty cell">
        <span class="cap" aria-hidden="true">Menge</span>
        <Input
          type="number"
          step="any"
          bind:value={it.quantity}
          aria-label="Menge der Position {idx + 1}"
          aria-invalid={quantityInvalid(it) || undefined}
          aria-describedby={quantityInvalid(it) ? ERROR_ID : undefined}
          disabled={readOnly}
          class="{CELL_FIELD} text-right tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>

      <div class="a-unit cell">
        <span class="cap" aria-hidden="true">Einheit</span>
        <Input bind:value={it.unit} aria-label="Einheit der Position {idx + 1}" disabled={readOnly} class={CELL_FIELD} />
      </div>

      <div class="a-price cell">
        <span class="cap" aria-hidden="true">Einzelpreis</span>
        <Input
          bind:value={it.priceText}
          onblur={() => commitPriceText(it)}
          placeholder="0,00"
          aria-label="Einzelpreis der Position {idx + 1} in {currency}"
          disabled={readOnly}
          class="{CELL_FIELD} text-right tabular-nums"
        />
      </div>

      {#if !vatExempt}
        <div class="a-vat cell">
          <span class="cap" aria-hidden="true">USt</span>
          <Select
            bind:value={() => String(it.vatRate), (v) => (it.vatRate = Number.parseInt(v, 10))}
            items={VAT_RATE_ITEMS}
            aria-label="Umsatzsteuer der Position {idx + 1}"
            disabled={readOnly}
            class={CELL_FIELD}
          />
        </div>
      {/if}

      <div class="a-amount cell">
        <span class="cap" aria-hidden="true">Betrag</span>
        <span class="value" title={keepsSavedAmount(it) ? "Gespeicherter Betrag" : undefined}>
          {formatMoney(computeLineTotal(toTotalsItem(it)), currency)}
        </span>
      </div>

      <div class="a-extras">
        {#if it.showDetail}
          <Textarea
            rows={2}
            placeholder="Detail-Beschreibung, z. B. Teilleistungen oder Spezifikation"
            aria-label="Detail-Beschreibung der Position {idx + 1}"
            bind:value={it.longDescription}
            disabled={readOnly}
            class="{CELL_FIELD} h-auto min-h-0 py-1.5"
          />
        {/if}
        <div class="flex flex-wrap gap-1.5">
          {#if it.showDetail}
            <button
              type="button"
              class={detailButton}
              onclick={() => {
                it.showDetail = false;
                it.longDescription = "";
              }}
              disabled={readOnly}
            >
              <X class="size-3" /> Detail entfernen
            </button>
          {:else}
            <button type="button" class={detailButton} onclick={() => (it.showDetail = true)} disabled={readOnly}>
              <FileText class="size-3" /> Detail-Beschreibung
            </button>
          {/if}
          <LinePeriodPopover bind:startIso={it.periodStartIso} bind:endIso={it.periodEndIso} disabled={readOnly} />
        </div>
      </div>

      <div class="a-actions">
        <div class="flex flex-col">
          <button
            type="button"
            class={moveButton}
            onclick={() => moveItem(idx, idx - 1)}
            disabled={idx === 0 || readOnly}
            title="Nach oben"
            aria-label="Position {idx + 1} nach oben"
          >
            <ChevronUp class="size-3.5" />
          </button>
          <button
            type="button"
            class={moveButton}
            onclick={() => moveItem(idx, idx + 1)}
            disabled={idx === items.length - 1 || readOnly}
            title="Nach unten"
            aria-label="Position {idx + 1} nach unten"
          >
            <ChevronDown class="size-3.5" />
          </button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:text-destructive"
          onclick={() => removeItem(idx)}
          disabled={items.length === 1 || readOnly}
          title="Position entfernen"
          aria-label="Position {idx + 1} entfernen"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  {/each}
</div>

<FieldError id={ERROR_ID} message={shownError} />

<div class="mt-3 flex flex-wrap gap-2">
  <Button type="button" size="sm" variant="outline" onclick={addItem} disabled={readOnly}>
    <Plus />
    Position
  </Button>
  <Button type="button" size="sm" variant="outline" onclick={() => (catalogPickerOpen = true)} disabled={readOnly}>
    <Package />
    Aus Katalog
  </Button>
  {@render actions?.()}
</div>
{#if hasSavedAmounts}
  <p class="mt-2 text-xs text-muted-foreground">{SAVED_AMOUNTS_HINT}</p>
{/if}

<TotalsBlock {totals} {currency} {vatExempt} {totalLabel} {vatNote} />

<CatalogPicker bind:open={catalogPickerOpen} onPick={addFromCatalog} {language} />

<style>
  .lines {
    --cols-handle: 2.25rem;
    --cols-actions: 3.75rem;
  }

  .line {
    display: grid;
    align-items: start;
    gap: 0.375rem 0.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
    grid-template-columns: var(--cols-handle) minmax(0, 1fr) 4.5rem 5rem 6.75rem 5.5rem 6.5rem var(--cols-actions);
    grid-template-areas:
      "handle desc qty unit price vat amount actions"
      ". extras extras extras extras extras extras .";
  }
  .exempt .line {
    grid-template-columns: var(--cols-handle) minmax(0, 1fr) 4.5rem 5rem 6.75rem 6.5rem var(--cols-actions);
    grid-template-areas:
      "handle desc qty unit price amount actions"
      ". extras extras extras extras extras .";
  }
  .compact .line {
    grid-template-columns: var(--cols-handle) 4.75rem 5rem minmax(0, 1fr) 5.5rem 6rem;
    grid-template-areas:
      "handle desc desc desc desc actions"
      ". qty unit price vat amount"
      ". extras extras extras extras extras";
  }
  .compact.exempt .line {
    grid-template-columns: var(--cols-handle) 4.75rem 5rem minmax(0, 1fr) 6rem;
    grid-template-areas:
      "handle desc desc desc actions"
      ". qty unit price amount"
      ". extras extras extras extras";
  }

  .line.head {
    padding: 0 0 0.5rem;
    border-bottom: 1.5px solid var(--foreground);
    align-items: end;
    color: var(--muted-foreground);
    font-size: 12px;
    font-weight: 700;
    grid-template-areas: "handle desc qty unit price vat amount actions";
  }
  .exempt .line.head {
    grid-template-areas: "handle desc qty unit price amount actions";
  }
  .head .r,
  .a-amount {
    text-align: right;
  }

  .a-handle { grid-area: handle; }
  .a-desc { grid-area: desc; min-width: 0; }
  .a-qty { grid-area: qty; }
  .a-unit { grid-area: unit; }
  .a-price { grid-area: price; }
  .a-vat { grid-area: vat; }
  .a-amount { grid-area: amount; }
  .a-extras { grid-area: extras; display: flex; min-width: 0; flex-direction: column; gap: 0.375rem; }
  .a-actions { grid-area: actions; display: flex; align-items: center; justify-content: flex-end; gap: 0.125rem; }

  .handle {
    display: flex;
    height: 2rem;
    align-items: center;
    gap: 1px;
  }
  .grip { display: inline-flex; color: var(--muted-foreground); cursor: grab; }
  .grip:hover { color: var(--foreground); }
  .grip.locked { cursor: default; opacity: 0.4; }
  .num { color: var(--foreground); font-size: 11px; font-variant-numeric: tabular-nums; }

  .cell { min-width: 0; }
  .cap { display: none; margin-bottom: 2px; color: var(--muted-foreground); font-size: 11px; }
  .compact .cap { display: block; }
  .value {
    display: flex;
    height: 2rem;
    align-items: center;
    justify-content: flex-end;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .compact .a-amount .value { height: 2rem; }

  .dragged { opacity: 0.5; }
  .drop-target { background: var(--surface); }
</style>
