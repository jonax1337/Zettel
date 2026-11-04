<script lang="ts">
  import { push } from "svelte-spa-router";
  import { deleteVendor, listVendors } from "$lib/db/queries";
  import type { Vendor } from "$lib/db/schema";
  import { Button, Card, ConfirmDialog, EmptyState, PageHeader, QueryBoundary } from "$lib/ui";
  import { Plus } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import SearchInput from "./parts/entity/SearchInput.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";

  let search = $state("");

  const vendors = createQueryState<Vendor[]>([], () => listVendors(search));
  $effect(() => {
    vendors.reload();
  });

  type SortKey = "vendorNumber" | "name" | "city" | "email";
  const sort = createListSort<SortKey>("vendors", { key: "name", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "vendorNumber", label: "Nr.", class: "whitespace-nowrap" },
    { key: "name", label: "Name", class: "min-w-32" },
    { key: "city", label: "Ort", class: "hidden @3xl:table-cell whitespace-nowrap" },
    { key: "email", label: "E-Mail", class: "hidden @3xl:table-cell whitespace-nowrap" },
  ];

  const sortedVendors = $derived(
    applySort(vendors.data, sort.state, {
      vendorNumber: (v) => v.vendorNumber,
      name: (v) => v.name,
      city: (v) => v.city,
      email: (v) => v.email,
    }),
  );

  const deletion = createDeleteFlow<Vendor>({
    remove: (v) => deleteVendor(v.id),
    entityLabel: "Lieferant",
    describe: (v) => v.name,
    reload: vendors.reload,
  });

  function editVendor(v: Vendor) {
    push(`/vendors/${v.id}`);
  }
</script>

<PageHeader
  title="Lieferanten"
  subtitle="{vendors.data.length} {pluralize(vendors.data.length, "Eintrag", "Einträge")}"
>
  {#snippet actions()}
    <Button onclick={() => push("/vendors/new")}>
      <Plus />
      Neuer Lieferant
    </Button>
  {/snippet}
</PageHeader>

<SearchInput
  bind:value={search}
  placeholder="Suche (Name, Nummer, Ort, E-Mail)…"
  class="mb-4 max-w-md"
/>

<QueryBoundary query={vendors} isEmpty={vendors.data.length === 0}>
  {#snippet empty()}
    <EmptyState
      variant={search ? "no-results" : "empty"}
      message={search ? "Keine Treffer." : "Noch keine Lieferanten angelegt."}
    />
  {/snippet}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <SortableHeaderRow {sort} {columns} actionsColumn />
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
              <RowActionsMenu onEdit={() => editVendor(v)} onDelete={() => deletion.ask(v)} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Lieferant löschen?"
  description={deletion.target ? `"${deletion.target.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
