<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    listCatalog,
    deleteCatalogItem,
    setArchived,
  } from "$lib/db/catalog";
  import type { CatalogItem } from "$lib/db/schema";
  import {
    Button,
    Card,
    Checkbox,
    Input,
    ConfirmDialog,
    DropdownMenu,
    DropdownItem,
    DropdownSeparator,
    Badge,
    toast,
  } from "$lib/ui";
  import {
    Plus,
    MoreHorizontal,
    Pencil,
    Trash2,
    Search,
    Archive,
    ArchiveRestore,
  } from "@lucide/svelte";
  import { centsToEur } from "$lib/utils/money";

  let items = $state<CatalogItem[]>([]);
  let search = $state("");
  let showArchived = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let confirmOpen = $state(false);
  let toDelete = $state<CatalogItem | null>(null);

  async function reload() {
    loading = true;
    try {
      items = await listCatalog({ includeArchived: showArchived });
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void showArchived;
    reload();
  });

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        (it.descriptionDe ?? "").toLowerCase().includes(q) ||
        (it.tags ?? "").toLowerCase().includes(q),
    );
  });

  async function toggleArchive(it: CatalogItem) {
    try {
      await setArchived(it.id, !it.archived);
      await reload();
      toast.success(it.archived ? "Wieder aktiv" : "Archiviert");
    } catch (e) {
      toast.error("Aktion fehlgeschlagen", String(e));
    }
  }

  function askDelete(it: CatalogItem) {
    toDelete = it;
    confirmOpen = true;
  }

  async function performDelete() {
    if (!toDelete) return;
    try {
      await deleteCatalogItem(toDelete.id);
      toast.success("Eintrag gelöscht");
      toDelete = null;
      await reload();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Artikel-Katalog</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Wiederverwendbare Positionen für Rechnungen, Angebote und Ausgaben.
      {filtered.length} {filtered.length === 1 ? "Eintrag" : "Einträge"}
    </p>
  </div>
  <Button onclick={() => push("/catalog/new")}>
    <Plus />
    Neuer Eintrag
  </Button>
</header>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <div class="relative max-w-md flex-1 min-w-[200px]">
    <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
    <Input
      type="search"
      placeholder="Suche (Name, Beschreibung, Tag)…"
      bind:value={search}
      class="pl-9"
    />
  </div>
  <label class="flex items-center gap-2 text-sm cursor-pointer">
    <Checkbox bind:checked={showArchived} />
    <span>Archivierte anzeigen</span>
  </label>
</div>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if filtered.length === 0}
  <Card>
    <div class="py-12 text-center text-sm text-muted-foreground">
      {search ? "Keine Treffer." : "Noch keine Katalog-Einträge."}
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium">Name</th>
          <th class="px-4 py-3 font-medium">Beschreibung</th>
          <th class="px-4 py-3 font-medium text-right">Standardpreis</th>
          <th class="px-4 py-3 font-medium text-right">USt</th>
          <th class="px-4 py-3 font-medium">Einheit</th>
          <th class="px-4 py-3 font-medium w-12"></th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each filtered as it (it.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors {it.archived ? 'opacity-60' : ''}">
            <td class="px-4 py-3">
              <button
                type="button"
                class="text-left hover:text-foreground font-medium transition-colors"
                onclick={() => push(`/catalog/${it.id}`)}
              >
                {it.name}
              </button>
              {#if it.archived}
                <Badge variant="secondary" class="ml-2 text-[10px]">archiviert</Badge>
              {/if}
            </td>
            <td class="px-4 py-3 text-muted-foreground truncate max-w-xs">{it.descriptionDe}</td>
            <td class="px-4 py-3 text-right tabular-nums">{centsToEur(it.defaultUnitPrice)} €</td>
            <td class="px-4 py-3 text-right tabular-nums">{it.defaultVatRate} %</td>
            <td class="px-4 py-3 text-muted-foreground">{it.unit}</td>
            <td class="px-4 py-3 text-right">
              <DropdownMenu>
                {#snippet trigger()}
                  <button
                    type="button"
                    class="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted transition-colors"
                    aria-label="Aktionen"
                  >
                    <MoreHorizontal class="size-4" />
                  </button>
                {/snippet}
                <DropdownItem onSelect={() => push(`/catalog/${it.id}`)}>
                  <Pencil />
                  Bearbeiten
                </DropdownItem>
                <DropdownItem onSelect={() => toggleArchive(it)}>
                  {#if it.archived}
                    <ArchiveRestore />
                    Wieder aktivieren
                  {:else}
                    <Archive />
                    Archivieren
                  {/if}
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem destructive onSelect={() => askDelete(it)}>
                  <Trash2 />
                  Löschen
                </DropdownItem>
              </DropdownMenu>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

<ConfirmDialog
  bind:open={confirmOpen}
  title="Katalog-Eintrag löschen?"
  description={toDelete ? `"${toDelete.name}" wird unwiderruflich entfernt. Bestehende Rechnungen mit dieser Position bleiben unverändert (Item-Daten sind kopiert).` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={performDelete}
/>
