<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { deleteCustomer, listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { Button, ConfirmDialog, DropdownItem, PageHeader, QueryBoundary } from "$lib/ui";
  import { FilePlus2, Plus } from "$lib/brand-icons";
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

  const FILTER_OPTIONS = [{ key: "onlyFollowUp", label: "Nur mit Wiedervorlage" }];

  const filters = createListFilters<{ search: string; onlyFollowUp: boolean }>("customers", {
    search: "",
    onlyFollowUp: false,
  });
  const f = filters.values;

  const customers = createQueryState<Customer[]>([], () => listCustomers(f.search));
  $effect(() => {
    customers.reload();
  });

  type SortKey = "customerNumber" | "name" | "city" | "email";
  const sort = createListSort<SortKey>("customers", { key: "name", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "customerNumber", label: "Nr.", class: "whitespace-nowrap" },
    { key: "name", label: "Name", class: "w-full" },
    { key: "city", label: "Ort", class: "whitespace-nowrap" },
    { key: "email", label: "E-Mail", class: `${WIDE_ONLY} whitespace-nowrap` },
  ];

  const visibleCustomers = $derived.by(() => {
    const matching = f.onlyFollowUp
      ? customers.data.filter((c) => c.followUpDate != null)
      : customers.data;
    return applySort(matching, sort.state, {
      customerNumber: (c) => c.customerNumber,
      name: (c) => c.name,
      city: (c) => c.city,
      email: (c) => c.email,
    });
  });

  const deletion = createDeleteFlow<Customer>({
    remove: (c) => deleteCustomer(c.id),
    entityLabel: "Kunde",
    describe: (c) => c.name,
    reload: customers.reload,
  });

  function editCustomer(c: Customer) {
    push(`/customers/${c.id}`);
  }
</script>

<PageHeader title="Kunden">
  {#snippet actions()}
    <Button onclick={() => push("/customers/new")}>
      <Plus />
      Neuer Kunde
    </Button>
  {/snippet}
</PageHeader>

<ListToolbar>
  <SearchInput
    bind:value={f.search}
    placeholder="Name, Nummer, Ort oder E-Mail suchen"
    label="Kunden suchen"
    class="min-w-[200px] flex-1 basis-[240px] max-w-[300px]"
  />
  <FilterMenu values={f} options={FILTER_OPTIONS} />
</ListToolbar>

<QueryBoundary query={customers} isEmpty={visibleCustomers.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={filters.isFiltered}
      onResetFilters={filters.reset}
      emptyMessage="Noch keine Kunden angelegt."
      createLabel="Neuer Kunde"
      onCreate={() => push("/customers/new")}
    />
  {/snippet}
  <table class="data-list">
    <SortableHeaderRow {sort} {columns} actionsColumn />
    <tbody>
      {#each visibleCustomers as c (c.id)}
        <tr class="cursor-pointer" onclick={() => editCustomer(c)}>
          <td class="text-muted-foreground whitespace-nowrap tabular-nums">{c.customerNumber}</td>
          <td class="w-full">
            <a
              href={`/customers/${c.id}`}
              use:link
              onclick={(e) => e.stopPropagation()}
              class="font-semibold hover:underline focus-visible:underline"
              title={c.name}
            >
              <span class="line-clamp-2">{c.name}</span>
            </a>
          </td>
          <td class="text-muted-foreground whitespace-nowrap">{c.city}</td>
          <td class="{WIDE_ONLY} text-muted-foreground whitespace-nowrap">{c.email ?? ""}</td>
          <td class="text-right" onclick={(e) => e.stopPropagation()}>
            <RowActionsMenu onEdit={() => editCustomer(c)} onDelete={() => deletion.ask(c)}>
              {#snippet extraItems()}
                <DropdownItem onSelect={() => push(`/invoices/new?customerId=${c.id}`)}>
                  <FilePlus2 />
                  Neue Rechnung
                </DropdownItem>
              {/snippet}
            </RowActionsMenu>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <ListSummary segments={countSummary(visibleCustomers.length, "Kunde", "Kunden")} />
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Kunde löschen?"
  description={deletion.target ? `"${deletion.target.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
