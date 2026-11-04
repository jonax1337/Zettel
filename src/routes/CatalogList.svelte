<script lang="ts">
  import { push } from "svelte-spa-router";
  import { listCatalog, deleteCatalogItem, setArchived } from "$lib/db/catalog";
  import type { CatalogItem } from "$lib/db/schema";
  import {
    Button,
    Card,
    Checkbox,
    ConfirmDialog,
    DropdownItem,
    Badge,
    toast,
    EmptyState,
    PageHeader,
    QueryBoundary,
  } from "$lib/ui";
  import { Plus, Archive, ArchiveRestore } from "$lib/brand-icons";
  import { centsToEur } from "$lib/utils/money";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import SearchInput from "./parts/entity/SearchInput.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";

  let search = $state("");
  let showArchived = $state(false);

  const catalog = createQueryState<CatalogItem[]>([], () =>
    listCatalog({ includeArchived: showArchived }),
  );
  $effect(() => {
    catalog.reload();
  });

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return catalog.data;
    return catalog.data.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.descriptionDe ?? "").toLowerCase().includes(q) ||
        (it.tags ?? "").toLowerCase().includes(q),
    );
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
  title="Artikel-Katalog"
  subtitle="Wiederverwendbare Positionen für Rechnungen, Angebote und Ausgaben. {filtered.length} {pluralize(filtered.length, "Eintrag", "Einträge")}"
>
  {#snippet actions()}
    <Button onclick={() => push("/catalog/new")}>
      <Plus />
      Neuer Eintrag
    </Button>
  {/snippet}
</PageHeader>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <SearchInput
    bind:value={search}
    placeholder="Suche (Name, Beschreibung, Tag)…"
    class="max-w-md flex-1 min-w-[200px]"
  />
  <label class="flex items-center gap-2 text-sm cursor-pointer">
    <Checkbox bind:checked={showArchived} />
    <span>Archivierte anzeigen</span>
  </label>
</div>

<QueryBoundary query={catalog} isEmpty={filtered.length === 0}>
  {#snippet empty()}
    <EmptyState
      variant={search ? "no-results" : "empty"}
      message={search ? "Keine Treffer." : "Noch keine Katalog-Einträge."}
    />
  {/snippet}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium min-w-32">Name</th>
          <th class="hidden @3xl:table-cell px-4 py-3 font-medium">Beschreibung</th>
          <th class="px-4 py-3 font-medium text-right whitespace-nowrap">Standardpreis</th>
          <th class="px-4 py-3 font-medium text-right whitespace-nowrap">USt</th>
          <th class="hidden @3xl:table-cell px-4 py-3 font-medium whitespace-nowrap">Einheit</th>
          <th class="px-4 py-3 font-medium w-12"></th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each filtered as it (it.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors {it.archived ? 'opacity-60' : ''}">
            <td class="px-4 py-3 min-w-32">
              <button
                type="button"
                class="text-left hover:text-foreground font-medium transition-colors"
                onclick={() => editItem(it)}
              >
                <span class="line-clamp-2" title={it.name}>{it.name}</span>
              </button>
              {#if it.archived}
                <Badge variant="secondary" class="ml-2 text-[10px]">archiviert</Badge>
              {/if}
            </td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground truncate max-w-xs">{it.descriptionDe}</td>
            <td class="px-4 py-3 text-right tabular-nums whitespace-nowrap">{centsToEur(it.defaultUnitPrice)}</td>
            <td class="px-4 py-3 text-right tabular-nums whitespace-nowrap">{it.defaultVatRate} %</td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground whitespace-nowrap">{it.unit}</td>
            <td class="px-4 py-3 text-right">
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
  </Card>
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Katalog-Eintrag löschen?"
  description={deletion.target ? `"${deletion.target.name}" wird unwiderruflich entfernt. Bestehende Rechnungen mit dieser Position bleiben unverändert (Item-Daten sind kopiert).` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
