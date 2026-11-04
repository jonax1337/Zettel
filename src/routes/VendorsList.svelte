<script lang="ts">
  import { push } from "svelte-spa-router";
  import { deleteVendor, listVendors } from "$lib/db/queries";
  import type { Vendor } from "$lib/db/schema";
  import { Button, Card, ConfirmDialog, SortableTh, toast, EmptyState } from "$lib/ui";
  import { Plus } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import SearchInput from "./parts/entity/SearchInput.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";

  const filters = createListFilters<{ search: string }>("vendors", { search: "" });
  const f = filters.values;

  const vendors = createQueryState<Vendor[]>([], () => listVendors(f.search));
  $effect(() => {
    vendors.reload();
  });

  type SortKey = "vendorNumber" | "name" | "city" | "email";
  const sort = createListSort<SortKey>("vendors", { key: "name", dir: "asc" });

  const sortedVendors = $derived(
    applySort(vendors.data, sort.state, {
      vendorNumber: (v) => v.vendorNumber,
      name: (v) => v.name,
      city: (v) => v.city,
      email: (v) => v.email,
    }),
  );

  let confirmOpen = $state(false);
  let toDelete = $state<Vendor | null>(null);

  function editVendor(v: Vendor) {
    push(`/vendors/${v.id}`);
  }

  function askDelete(v: Vendor) {
    toDelete = v;
    confirmOpen = true;
  }

  async function performDelete() {
    if (!toDelete) return;
    try {
      await deleteVendor(toDelete.id);
      toast.success("Lieferant gelöscht", `"${toDelete.name}" wurde entfernt.`);
      toDelete = null;
      await vendors.reload();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Lieferanten</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {vendors.data.length} {pluralize(vendors.data.length, "Eintrag", "Einträge")}
    </p>
  </div>
  <Button onclick={() => push("/vendors/new")}>
    <Plus />
    Neuer Lieferant
  </Button>
</header>

<SearchInput
  bind:value={f.search}
  placeholder="Suche (Name, Nummer, Ort, E-Mail)…"
  class="mb-4 max-w-md"
/>

{#if vendors.error}
  <p class="text-sm text-destructive">Fehler: {vendors.error}</p>
{:else if vendors.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if vendors.data.length === 0}
  {#if filters.isFiltered}
    <EmptyState
      variant="no-results"
      message="Keine Treffer."
      actionLabel="Filter zurücksetzen"
      onAction={filters.reset}
    />
  {:else}
    <EmptyState
      message="Noch keine Lieferanten angelegt."
      actionLabel="Neuer Lieferant"
      onAction={() => push("/vendors/new")}
    />
  {/if}
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <SortableTh column="vendorNumber" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 whitespace-nowrap">Nr.</SortableTh>
          <SortableTh column="name" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 min-w-32">Name</SortableTh>
          <SortableTh column="city" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">Ort</SortableTh>
          <SortableTh column="email" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">E-Mail</SortableTh>
          <th class="px-4 py-3 font-medium w-12"></th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each sortedVendors as v (v.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors">
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{v.vendorNumber}</td>
            <td class="px-4 py-3 min-w-32">
              <button
                type="button"
                class="text-left hover:text-foreground font-medium transition-colors"
                onclick={() => editVendor(v)}
              >
                <span class="line-clamp-2" title={v.name}>{v.name}</span>
              </button>
            </td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground whitespace-nowrap">{v.city}</td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground whitespace-nowrap">{v.email ?? ""}</td>
            <td class="px-4 py-3 text-right">
              <RowActionsMenu onEdit={() => editVendor(v)} onDelete={() => askDelete(v)} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

<ConfirmDialog
  bind:open={confirmOpen}
  title="Lieferant löschen?"
  description={toDelete ? `"${toDelete.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={performDelete}
/>
