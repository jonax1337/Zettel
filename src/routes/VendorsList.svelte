<script lang="ts">
  import { deleteVendor, listVendors } from "$lib/db/queries";
  import type { Vendor } from "$lib/db/schema";
  import {
    Button,
    Card,
    Input,
    ConfirmDialog,
    DropdownMenu,
    DropdownItem,
    DropdownSeparator,
    SortableTh,
    toast,
  } from "$lib/ui";
  import { Plus, MoreHorizontal, Pencil, Trash2, Search } from "@lucide/svelte";
  import { push } from "svelte-spa-router";
  import { applySort, loadSortState, saveSortState, type SortState } from "$lib/utils/sort";

  let search = $state("");
  let vendors = $state<Vendor[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let confirmOpen = $state(false);
  let toDelete = $state<Vendor | null>(null);

  async function reload() {
    loading = true;
    try {
      vendors = await listVendors(search);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void search;
    reload();
  });

  function newVendor() {
    push("/vendors/new");
  }

  function editVendor(v: Vendor) {
    push(`/vendors/${v.id}`);
  }

  function askDelete(v: Vendor) {
    toDelete = v;
    confirmOpen = true;
  }

  type SortKey = "vendorNumber" | "name" | "city" | "email";
  let sort = $state<SortState<SortKey>>(loadSortState<SortKey>("vendors", { key: "name", dir: "asc" }));
  function setSort(key: SortKey, dir: SortState<SortKey>["dir"]) {
    sort = { key: dir === null ? null : key, dir };
    saveSortState("vendors", sort);
  }
  const sortedVendors = $derived(
    applySort(vendors, sort, {
      vendorNumber: (r) => r.vendorNumber,
      name: (r) => r.name,
      city: (r) => r.city,
      email: (r) => r.email,
    }),
  );

  async function performDelete() {
    if (!toDelete) return;
    try {
      await deleteVendor(toDelete.id);
      toast.success("Lieferant gelöscht", `"${toDelete.name}" wurde entfernt.`);
      toDelete = null;
      await reload();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Lieferanten</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {vendors.length} {vendors.length === 1 ? "Eintrag" : "Einträge"}
    </p>
  </div>
  <Button onclick={newVendor}>
    <Plus />
    Neuer Lieferant
  </Button>
</header>

<div class="mb-4 relative max-w-md">
  <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
  <Input
    type="search"
    placeholder="Suche (Name, Nummer, Ort, E-Mail)…"
    bind:value={search}
    class="pl-9"
  />
</div>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if vendors.length === 0}
  <Card>
    <div class="py-12 text-center text-sm text-muted-foreground">
      {search ? "Keine Treffer." : "Noch keine Lieferanten angelegt."}
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <SortableTh column="vendorNumber" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Nr.</SortableTh>
          <SortableTh column="name" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Name</SortableTh>
          <SortableTh column="city" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Ort</SortableTh>
          <SortableTh column="email" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">E-Mail</SortableTh>
          <th class="px-4 py-3 font-medium w-12"></th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each sortedVendors as v (v.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors">
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{v.vendorNumber}</td>
            <td class="px-4 py-3">
              <button
                type="button"
                class="text-left hover:text-foreground font-medium transition-colors"
                onclick={() => editVendor(v)}
              >
                {v.name}
              </button>
            </td>
            <td class="px-4 py-3 text-muted-foreground">{v.city}</td>
            <td class="px-4 py-3 text-muted-foreground">{v.email ?? ""}</td>
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
                <DropdownItem onSelect={() => editVendor(v)}>
                  <Pencil />
                  Bearbeiten
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem destructive onSelect={() => askDelete(v)}>
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
  title="Lieferant löschen?"
  description={toDelete ? `"${toDelete.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={performDelete}
/>
