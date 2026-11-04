<script lang="ts">
  import { computeLineTotal } from "$lib/db/expenses";
  import { accountForSkr } from "$lib/db/expense-categories";
  import type { ExpenseCategory } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { Button, Card, Input, Select } from "$lib/ui";
  import { Package, Plus, Trash2 } from "$lib/brand-icons";
  import { commitPriceText } from "../entity/format";
  import { VAT_RATE_ITEMS } from "../entity/vat";
  import type { ExpenseItemRow } from "./expense-form";

  type Props = {
    items: ExpenseItemRow[];
    editable: boolean;
    reverseCharge: boolean;
    totals: { subtotal: number; vatAmount: number; total: number };
    curatedCategories: ExpenseCategory[];
    categorySuggestions: string[];
    onAdd: () => void;
    onAddFromCatalog: () => void;
  };
  let {
    items = $bindable(),
    editable,
    reverseCharge,
    totals,
    curatedCategories,
    categorySuggestions,
    onAdd,
    onAddFromCatalog,
  }: Props = $props();

  const FREE_TEXT_CATEGORY = "";
  const CATEGORY_LIST_ID = "expense-categories";

  const categoryItems = $derived([
    { value: FREE_TEXT_CATEGORY, label: "— frei eintragen —" },
    ...curatedCategories.map((c) => ({ value: String(c.id), label: c.name })),
  ]);

  function pickCategory(item: ExpenseItemRow, value: string) {
    const category = curatedCategories.find((c) => String(c.id) === value);
    if (!category) {
      item.categoryId = null;
      return;
    }
    item.categoryId = category.id;
    item.category = category.name;
    // The DATEV export resolves the account per category and SKR again; this is only a hint in the form.
    item.datevAccount ||= accountForSkr(category, "SKR03");
  }

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }
</script>

<section class="mt-6">
  <div class="flex items-center justify-between mb-3">
    <h2 class="text-lg font-medium">Positionen</h2>
    <div class="inline-flex items-center gap-2">
      <Button type="button" variant="outline" onclick={onAddFromCatalog} disabled={!editable}>
        <Package />
        Aus Katalog…
      </Button>
      <Button type="button" variant="outline" onclick={onAdd} disabled={!editable}>
        <Plus />
        Position
      </Button>
    </div>
  </div>
  <Card class="overflow-hidden py-0">
    <table class="w-full table-fixed text-sm">
      <thead class="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        <tr>
          <th class="px-1.5 @3xl:px-3 py-2 w-7 @3xl:w-8 font-medium">#</th>
          <th class="px-1.5 @3xl:px-3 py-2 font-medium">Beschreibung</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-28 @3xl:w-40 font-medium">Kategorie</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-[4.25rem] @3xl:w-20 font-medium">Menge</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-[4.75rem] @3xl:w-24 font-medium"><span class="@3xl:hidden">Preis</span><span class="hidden @3xl:inline">Einzelpreis</span></th>
          {#if !reverseCharge}
            <th class="px-1.5 @3xl:px-3 py-2 w-16 @3xl:w-24 font-medium">USt</th>
          {/if}
          <th class="px-1.5 @3xl:px-3 py-2 w-24 @3xl:w-28 font-medium text-right">Summe</th>
          <th class="px-1.5 @3xl:px-3 py-2 w-10 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {#each items as item, idx (idx)}
          <tr class="border-t">
            <td class="px-1.5 @3xl:px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
            <td class="px-1.5 @3xl:px-2 py-1.5">
              <Input bind:value={item.description} required disabled={!editable} />
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5">
              <div class="flex flex-col gap-1">
                <Select
                  items={categoryItems}
                  value={item.categoryId ? String(item.categoryId) : FREE_TEXT_CATEGORY}
                  onValueChange={(v) => pickCategory(item, v)}
                  disabled={!editable}
                  class="px-2 @3xl:px-3"
                />
                {#if !item.categoryId}
                  <Input
                    bind:value={item.category}
                    list={CATEGORY_LIST_ID}
                    placeholder="oder Freitext…"
                    disabled={!editable}
                    class="px-2 @3xl:px-3 text-xs"
                  />
                {/if}
              </div>
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5">
              <Input
                type="number"
                step="0.01"
                min="0"
                bind:value={item.quantity}
                disabled={!editable}
                class="px-2 @3xl:px-3 [&::-webkit-inner-spin-button]:appearance-none @3xl:[&::-webkit-inner-spin-button]:appearance-auto"
              />
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5">
              <Input
                bind:value={item.priceText}
                onblur={() => commitPriceText(item)}
                placeholder="0,00"
                class="px-2 @3xl:px-3 text-right"
                disabled={!editable}
              />
            </td>
            {#if !reverseCharge}
              <td class="px-1.5 @3xl:px-2 py-1.5">
                <Select
                  bind:value={() => String(item.vatRate), (v) => (item.vatRate = Number.parseInt(v, 10))}
                  items={VAT_RATE_ITEMS}
                  class="px-2 @3xl:px-3"
                />
              </td>
            {/if}
            <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono text-xs whitespace-nowrap">
              {centsToEur(computeLineTotal(item))}
            </td>
            <td class="px-1.5 @3xl:px-2 py-1.5 text-right">
              <button
                type="button"
                onclick={() => removeItem(idx)}
                disabled={items.length === 1 || !editable}
                class="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Position entfernen"
                aria-label="Position entfernen"
              >
                <Trash2 class="size-4" />
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="bg-muted/40 text-sm">
        <tr class="border-t">
          <td colspan={reverseCharge ? 5 : 6} class="px-1.5 @3xl:px-3 py-2 text-right text-muted-foreground">
            Zwischensumme
          </td>
          <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono whitespace-nowrap">{centsToEur(totals.subtotal)}</td>
          <td></td>
        </tr>
        {#if !reverseCharge}
          <tr>
            <td colspan="6" class="px-1.5 @3xl:px-3 py-2 text-right text-muted-foreground">USt (Vorsteuer)</td>
            <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono whitespace-nowrap">{centsToEur(totals.vatAmount)}</td>
            <td></td>
          </tr>
        {/if}
        <tr class="border-t">
          <td colspan={reverseCharge ? 5 : 6} class="px-1.5 @3xl:px-3 py-2 text-right font-semibold">
            Gesamtbetrag
          </td>
          <td class="px-1.5 @3xl:px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{centsToEur(totals.total)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </Card>
  <datalist id={CATEGORY_LIST_ID}>
    {#each categorySuggestions as suggestion (suggestion)}
      <option value={suggestion}></option>
    {/each}
  </datalist>
</section>
