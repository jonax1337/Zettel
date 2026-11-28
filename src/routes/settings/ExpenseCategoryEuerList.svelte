<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { onMount } from "svelte";
  import { Select, toast } from "$lib/ui";
  import { listCategories, setCategoryEuerKz } from "$lib/db/expense-categories";
  import type { ExpenseCategory } from "$lib/db/schema";
  import { EUER_CATEGORY_LINES, EUER_KZ, EUER_LINE_NUMBERS, formYearFor } from "$lib/reports/euer-form";

  const formYear = formYearFor(new Date().getFullYear()).year;
  const kzItems = EUER_CATEGORY_LINES.map((line) => ({
    value: line.kz,
    label: `Kz ${line.kz} · Zeile ${EUER_LINE_NUMBERS[formYear][line.kz]} · ${line.label}`,
  }));

  let categories = $state<ExpenseCategory[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  // Remounts the selects after a failed save, so they show the stored value again.
  let reloadCount = $state(0);

  async function load() {
    try {
      categories = await listCategories();
      loadError = null;
    } catch (e) {
      loadError = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  onMount(load);

  async function assign(category: ExpenseCategory, kz: string) {
    try {
      await setCategoryEuerKz(category.id, kz);
      category.euerKz = kz;
    } catch (e) {
      toast.error("Zuordnung konnte nicht gespeichert werden", errorMessage(e));
      await load();
      reloadCount++;
    }
  }
</script>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if loadError}
  <p class="text-sm text-destructive">Kategorien konnten nicht geladen werden: {loadError}</p>
{:else}
  {#key reloadCount}
    <table class="data-list table-fixed">
      <thead>
        <tr>
          <th>Kategorie</th>
          <th class="w-[62%]">Zeile der Anlage EÜR</th>
        </tr>
      </thead>
      <tbody>
        {#each categories as category (category.id)}
          <tr>
            <td class="truncate font-semibold">{category.name}</td>
            <td>
              <Select
                items={kzItems}
                value={category.euerKz ?? EUER_KZ.expenseOther}
                class="*:first:truncate"
                aria-label="Zeile der Anlage EÜR für {category.name}"
                onValueChange={(kz) => assign(category, kz)}
              />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/key}
{/if}
