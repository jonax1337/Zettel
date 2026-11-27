<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { periodForYear } from "$lib/dashboard/period";
  import { deleteVendor, listVendors } from "$lib/db/queries";
  import type { Vendor } from "$lib/db/schema";
  import { loadVendorListFigures, type VendorExpenseFigures } from "$lib/db/vendor-overview";
  import { formatDate } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
  import { Button, ConfirmDialog, PageHeader, QueryBoundary } from "$lib/ui";
  import { Plus } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import { WIDE_ONLY } from "./invoice/list-support";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import SearchInput from "./parts/entity/SearchInput.svelte";
  import { withFigures } from "./parts/vendor/vendor-list";
  import { createDeleteFlow } from "./parts/entity/delete-flow.svelte";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import ListSummary from "./parts/list/ListSummary.svelte";
  import ListToolbar from "./parts/list/ListToolbar.svelte";
  import { countSummary } from "./parts/list/list-summary";

  const filters = createListFilters<{ search: string }>("vendors", { search: "" });
  const f = filters.values;

  const vendors = createQueryState<Vendor[]>([], () => listVendors(f.search));
  $effect(() => {
    vendors.reload();
  });

  const year = new Date().getFullYear();
  const NO_FIGURE = "–";

  // The figures do not depend on the search term, so they load once, not with every keystroke.
  const figures = createQueryState<ReadonlyMap<number, VendorExpenseFigures>>(new Map(), () =>
    loadVendorListFigures(periodForYear(year)),
  );
  $effect(() => {
    figures.reload();
  });

  const listQuery = {
    get loading() {
      return vendors.loading || figures.loading;
    },
    get error() {
      return vendors.error ?? figures.error;
    },
  };
  const rows = $derived(withFigures(vendors.data, figures.data));

  type SortKey = "vendorNumber" | "name" | "city" | "email" | "grossInPeriod" | "lastExpenseDate";
  const sort = createListSort<SortKey>("vendors", { key: "name", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "vendorNumber", label: "Nr.", class: "whitespace-nowrap" },
    { key: "name", label: "Name", class: "w-full" },
    { key: "city", label: "Ort", class: "whitespace-nowrap" },
    { key: "email", label: "E-Mail", class: `${WIDE_ONLY} whitespace-nowrap` },
    { key: "grossInPeriod", label: `Ausgaben ${year} brutto`, align: "right", class: "text-right whitespace-nowrap" },
    { key: "lastExpenseDate", label: "Letzte Ausgabe", class: `${WIDE_ONLY} whitespace-nowrap` },
  ];

  const sortedVendors = $derived(
    applySort(rows, sort.state, {
      vendorNumber: (v) => v.vendorNumber,
      name: (v) => v.name,
      city: (v) => v.city,
      email: (v) => v.email,
      grossInPeriod: (v) => v.grossInPeriod,
      lastExpenseDate: (v) => v.lastExpenseDate,
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

<PageHeader title="Lieferanten">
  {#snippet actions()}
    <Button onclick={() => push("/vendors/new")}>
      <Plus />
      Neuer Lieferant
    </Button>
  {/snippet}
</PageHeader>

<ListToolbar>
  <SearchInput
    bind:value={f.search}
    placeholder="Name, Nummer, Ort oder E-Mail suchen"
    label="Lieferanten suchen"
    class="min-w-[200px] flex-1 basis-[240px] max-w-[300px]"
  />
</ListToolbar>

<QueryBoundary query={listQuery} isEmpty={vendors.data.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={filters.isFiltered}
      onResetFilters={filters.reset}
      emptyMessage="Noch keine Lieferanten angelegt."
      createLabel="Neuer Lieferant"
      onCreate={() => push("/vendors/new")}
    />
  {/snippet}
  <table class="data-list">
    <SortableHeaderRow {sort} {columns} actionsColumn />
    <tbody>
      {#each sortedVendors as v (v.id)}
        <tr class="cursor-pointer" onclick={() => editVendor(v)}>
          <td class="text-muted-foreground whitespace-nowrap tabular-nums">{v.vendorNumber}</td>
          <td class="w-full">
            <a
              href={`/vendors/${v.id}`}
              use:link
              onclick={(e) => e.stopPropagation()}
              class="font-semibold hover:underline focus-visible:underline"
              title={v.name}
            >
              <span class="line-clamp-2">{v.name}</span>
            </a>
          </td>
          <td class="text-muted-foreground whitespace-nowrap">{v.city}</td>
          <td class="{WIDE_ONLY} text-muted-foreground whitespace-nowrap">{v.email ?? ""}</td>
          <td class="text-right font-semibold whitespace-nowrap tabular-nums">
            {#if v.grossInPeriod}{centsToEur(v.grossInPeriod)}{:else}<span class="font-normal text-muted-foreground">{NO_FIGURE}</span>{/if}
          </td>
          <td class="{WIDE_ONLY} text-muted-foreground whitespace-nowrap tabular-nums">
            {v.lastExpenseDate ? formatDate(v.lastExpenseDate) : NO_FIGURE}
          </td>
          <td class="text-right" onclick={(e) => e.stopPropagation()}>
            <RowActionsMenu onEdit={() => editVendor(v)} onDelete={() => deletion.ask(v)} />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <ListSummary segments={countSummary(sortedVendors.length, "Lieferant", "Lieferanten")} />
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Lieferant löschen?"
  description={deletion.target ? `"${deletion.target.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
