<script lang="ts">
  import { computeLineTotal } from "$lib/utils/totals";
  import type { ExpenseCategory } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { Button, Input, Select } from "$lib/ui";
  import { Trash2 } from "$lib/brand-icons";
  import { commitPriceText } from "../entity/format";
  import { VAT_RATE_ITEMS } from "$lib/utils/vat";
  import { applyCategory, type ExpenseItemRow } from "./expense-form";

  type Props = {
    items: ExpenseItemRow[];
    editable: boolean;
    reverseCharge: boolean;
    totals: { subtotal: number; vatAmount: number; total: number };
    curatedCategories: ExpenseCategory[];
    categorySuggestions: string[];
    /** Shown below the table; the row lists say which controls to mark invalid. */
    error?: string | null;
    descriptionRows?: number[];
    quantityRows?: number[];
  };
  let {
    items = $bindable(),
    editable,
    reverseCharge,
    totals,
    curatedCategories,
    categorySuggestions,
    error = null,
    descriptionRows = [],
    quantityRows = [],
  }: Props = $props();

  const FREE_TEXT_CATEGORY = "";
  const CATEGORY_LIST_ID = "expense-categories";

  const categoryItems = $derived([
    { value: FREE_TEXT_CATEGORY, label: "— frei eintragen —" },
    ...curatedCategories.map((c) => ({ value: String(c.id), label: c.name })),
  ]);

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }
</script>

<table class="data-list table-fixed text-sm [&_td]:px-1.5 [&_th]:px-1.5">
  <thead>
    <tr>
      <th class="w-7 @3xl:w-8">#</th>
      <th>Beschreibung</th>
      <th class="w-28 @3xl:w-40">Kategorie</th>
      <th class="w-[4.25rem] @3xl:w-20">Menge</th>
      <th class="w-[4.75rem] @3xl:w-24"><span class="@3xl:hidden">Preis</span><span class="hidden @3xl:inline">Einzelpreis</span></th>
      {#if !reverseCharge}
        <th class="w-16 @3xl:w-24">USt</th>
      {/if}
      <th class="w-24 text-right @3xl:w-28">Summe</th>
      <th class="w-10"></th>
    </tr>
  </thead>
  <tbody>
    {#each items as item, idx (idx)}
      <tr>
        <td class="text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
        <td class="py-1.5">
          <Input
            bind:value={item.description}
            disabled={!editable}
            aria-label="Beschreibung der Position {idx + 1}"
            aria-required="true"
            aria-invalid={descriptionRows.includes(idx) ? true : undefined}
          />
        </td>
        <td class="py-1.5">
          <div class="flex flex-col gap-1">
            <Select
              items={categoryItems}
              value={item.categoryId ? String(item.categoryId) : FREE_TEXT_CATEGORY}
              onValueChange={(v) => applyCategory(item, curatedCategories.find((c) => String(c.id) === v))}
              disabled={!editable}
              aria-label="Kategorie der Position {idx + 1}"
              class="px-2 @3xl:px-3"
            />
            {#if !item.categoryId}
              <Input
                bind:value={item.category}
                list={CATEGORY_LIST_ID}
                placeholder="oder Freitext…"
                disabled={!editable}
                class="px-2 text-xs @3xl:px-3"
              />
            {/if}
          </div>
        </td>
        <td class="py-1.5">
          <Input
            type="number"
            step="any"
            bind:value={item.quantity}
            disabled={!editable}
            aria-label="Menge der Position {idx + 1}"
            aria-required="true"
            aria-invalid={quantityRows.includes(idx) ? true : undefined}
            class="px-2 @3xl:px-3 [&::-webkit-inner-spin-button]:appearance-none @3xl:[&::-webkit-inner-spin-button]:appearance-auto"
          />
        </td>
        <td class="py-1.5">
          <Input
            bind:value={item.priceText}
            onblur={() => commitPriceText(item)}
            placeholder="0,00"
            disabled={!editable}
            aria-label="Einzelpreis der Position {idx + 1}"
            class="px-2 text-right @3xl:px-3"
          />
        </td>
        {#if !reverseCharge}
          <td class="py-1.5">
            <Select
              bind:value={() => String(item.vatRate), (v) => (item.vatRate = Number.parseInt(v, 10))}
              items={VAT_RATE_ITEMS}
              disabled={!editable}
              aria-label="USt der Position {idx + 1}"
              class="px-2 @3xl:px-3"
            />
          </td>
        {/if}
        <td class="whitespace-nowrap text-right font-semibold tabular-nums">
          {centsToEur(computeLineTotal(item))}
        </td>
        <td class="text-right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 text-muted-foreground hover:text-destructive"
            onclick={() => removeItem(idx)}
            disabled={items.length === 1 || !editable}
            title="Position entfernen"
            aria-label="Position entfernen"
          >
            <Trash2 />
          </Button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>
{#if error}
  <p class="mt-2 text-[13px] text-destructive" role="alert">{error}</p>
{/if}

<dl class="mt-4 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
  <dt class="text-muted-foreground">Zwischensumme</dt>
  <dd class="text-right">{centsToEur(totals.subtotal)}</dd>
  {#if !reverseCharge}
    <dt class="text-muted-foreground">USt (Vorsteuer)</dt>
    <dd class="text-right">{centsToEur(totals.vatAmount)}</dd>
  {/if}
  <dt class="border-t border-border pt-1.5 font-display font-extrabold">Gesamtbetrag</dt>
  <dd class="border-t border-border pt-1.5 text-right font-display font-extrabold">{centsToEur(totals.total)}</dd>
</dl>

<datalist id={CATEGORY_LIST_ID}>
  {#each categorySuggestions as suggestion (suggestion)}
    <option value={suggestion}></option>
  {/each}
</datalist>
