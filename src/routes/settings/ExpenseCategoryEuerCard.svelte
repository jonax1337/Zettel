<script lang="ts">
  import { onMount } from "svelte";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle, Select, toast } from "$lib/ui";
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
      loadError = String(e);
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
      toast.error("Zuordnung konnte nicht gespeichert werden", String(e));
      await load();
      reloadCount++;
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle>Anlage EÜR: Ausgabenkategorien</CardTitle>
    <CardDescription>
      Bestimmt, in welcher Zeile der Anlage EÜR die Ausgaben einer Kategorie erscheinen. Ausgaben ohne
      Kategorie landen in „Übrige unbeschränkt abziehbare Betriebsausgaben“. Änderungen gelten sofort.
    </CardDescription>
  </CardHeader>
  <CardContent>
    {#if loading}
      <p class="text-sm text-muted-foreground">Lade…</p>
    {:else if loadError}
      <p class="text-sm text-destructive">Kategorien konnten nicht geladen werden: {loadError}</p>
    {:else}
      {#key reloadCount}
        <ul class="space-y-3">
          {#each categories as category (category.id)}
            <li class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-2">
              <span class="text-sm">{category.name}</span>
              <Select
                items={kzItems}
                value={category.euerKz ?? EUER_KZ.expenseOther}
                aria-label="Zeile der Anlage EÜR für {category.name}"
                onValueChange={(kz) => assign(category, kz)}
              />
            </li>
          {/each}
        </ul>
      {/key}
    {/if}
  </CardContent>
</Card>
