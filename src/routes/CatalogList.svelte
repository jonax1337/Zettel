<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { listCatalog, deleteCatalogItem, setArchived } from "$lib/db/catalog";
  import type { CatalogItem } from "$lib/db/schema";
  import { Button, ConfirmDialog, DropdownItem, Badge, toast, PageHeader, QueryBoundary } from "$lib/ui";
  import { Plus, Archive, ArchiveRestore } from "$lib/brand-icons";
  import { centsToEur } from "$lib/utils/money";
  import { applySort } from "$lib/utils/sort";
  import { WIDE_ONLY } from "./invoice/list-support";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import SearchInput from "./parts/entity/SearchInput.svelte";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import FilterMenu from "./parts/list/FilterMenu.svelte";
  import ListSummary from "./parts/list/ListSummary.svelte";
  import ListToolbar from "./parts/list/ListToolbar.svelte";
  import { countSummary } from "./parts/list/list-summary";

  const FILTER_OPTIONS = [{ key: "showArchived", label: "Archivierte anzeigen" }];

  const filters = createListFilters<{ search: string; showArchived: boolean }>("catalog", {
    search: "",
    showArchived: false,
  });
  const f = filters.values;

  const catalog = createQueryState<CatalogItem[]>([], () =>
    listCatalog({ includeArchived: f.showArchived }),
  );
  $effect(() => {
    catalog.reload();
  });

  type SortKey = "name" | "description" | "unit" | "vatRate" | "price";
  const sort = createListSort<SortKey>("catalog", { key: "name", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "name", label: "Eintrag", class: "w-full" },
    { key: "description", label: "Beschreibung", class: `${WIDE_ONLY} whitespace-nowrap` },
    { key: "unit", label: "Einheit", class: "whitespace-nowrap" },
    { key: "vatRate", label: "USt", align: "right", class: "text-right whitespace-nowrap" },
    { key: "price", label: "Preis", align: "right", class: "text-right whitespace-nowrap" },
  ];

  const filtered = $derived.by(() => {
    const q = f.search.trim().toLowerCase();
    const matching = q === "" ? catalog.data : catalog.data.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.descriptionDe ?? "").toLowerCase().includes(q) ||
        (it.tags ?? "").toLowerCase().includes(q),
    );
    return applySort(matching, sort.state, {
      name: (it) => it.name,
      description: (it) => it.descriptionDe,
      unit: (it) => it.unit,
      vatRate: (it) => it.defaultVatRate,
      price: (it) => it.defaultUnitPrice,
    });
  });

  const deletion = createDeleteFlow<CatalogItem>({
    remove: (it) => deleteCatalogItem(it.id),
    entityLabel: "Eintrag",
    reload: catalog.reload,
  });

  function editItem(it: CatalogItem) {
    push(`/catalog/${it.id}`);
  }

  async function toggleArchive(it: CatalogItem) {
    try {
      await setArchived(it.id, !it.archived);
      await catalog.reload();
      toast.success(it.archived ? "Wieder aktiv" : "Archiviert");
    } catch (e) {
      toast.error("Aktion fehlgeschlagen", String(e));
    }
  }
</script>

<PageHeader
  title="Katalog"
  subtitle="Leistungen und Artikel, die du immer wieder in Rechnungen, Angeboten und Ausgaben verwendest."
>
  {#snippet actions()}
    <Button onclick={() => push("/catalog/new")}>
      <Plus />
      Neuer Eintrag
    </Button>
  {/snippet}
</PageHeader>

<ListToolbar>
  <SearchInput
    bind:value={f.search}
    placeholder="Name, Beschreibung oder Tag suchen"
    label="Katalog durchsuchen"
    class="min-w-[200px] flex-1 basis-[240px] max-w-[300px]"
  />
  <FilterMenu values={f} options={FILTER_OPTIONS} />
</ListToolbar>

<QueryBoundary query={catalog} isEmpty={filtered.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={filters.isFiltered}
      onResetFilters={filters.reset}
      emptyMessage="Noch keine Katalog-Einträge."
      createLabel="Neuer Eintrag"
      onCreate={() => push("/catalog/new")}
    />
  {/snippet}
  <table class="data-list">
    <SortableHeaderRow {sort} {columns} actionsColumn />
    <tbody>
      {#each filtered as it (it.id)}
        <tr class="cursor-pointer {it.archived ? 'opacity-60' : ''}" onclick={() => editItem(it)}>
          <td class="w-full">
            <span class="inline-flex items-center gap-2">
              <a
                href={`/catalog/${it.id}`}
                use:link
                onclick={(e) => e.stopPropagation()}
                class="font-semibold hover:underline focus-visible:underline"
                title={it.name}
              >
                <span class="line-clamp-2">{it.name}</span>
              </a>
              {#if it.archived}
                <Badge variant="outline">archiviert</Badge>
              {/if}
            </span>
          </td>
          <td class="{WIDE_ONLY} max-w-xs truncate text-muted-foreground">{it.descriptionDe}</td>
          <td class="text-muted-foreground whitespace-nowrap">{it.unit}</td>
          <td class="text-right whitespace-nowrap tabular-nums">{it.defaultVatRate} %</td>
          <td class="text-right font-semibold whitespace-nowrap tabular-nums">{centsToEur(it.defaultUnitPrice)}</td>
          <td class="text-right" onclick={(e) => e.stopPropagation()}>
            <RowActionsMenu onEdit={() => editItem(it)} onDelete={() => deletion.ask(it)}>
              {#snippet extraItems()}
                <DropdownItem onSelect={() => toggleArchive(it)}>
                  {#if it.archived}
                    <ArchiveRestore />
                    Wieder aktivieren
                  {:else}
                    <Archive />
                    Archivieren
                  {/if}
                </DropdownItem>
              {/snippet}
            </RowActionsMenu>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <ListSummary segments={countSummary(filtered.length, "Eintrag", "Einträge")} />
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Katalog-Eintrag löschen?"
  description={deletion.target ? `"${deletion.target.name}" wird unwiderruflich entfernt. Bestehende Rechnungen mit dieser Position bleiben unverändert (Item-Daten sind kopiert).` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
