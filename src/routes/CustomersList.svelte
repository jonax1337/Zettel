<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { periodForYear } from "$lib/dashboard/period";
  import { loadCustomerListFigures, type InvoiceFigures } from "$lib/db/customer-overview";
  import { deleteCustomer, listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { formatDate } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
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
  import { withFigures } from "./parts/customer/customer-list";
  import ListSummary from "./parts/list/ListSummary.svelte";
  import ListToolbar from "./parts/list/ListToolbar.svelte";
  import { countSummary } from "./parts/list/list-summary";

  const FILTER_OPTIONS = [{ key: "onlyFollowUp", label: "Nur mit Wiedervorlage" }];

  const filters = createListFilters<{ search: string; onlyFollowUp: boolean }>("customers", {
    search: "",
    onlyFollowUp: false,
  });
  const f = filters.values;

  const year = new Date().getFullYear();
  const NO_FIGURE = "–";

  const customers = createQueryState<Customer[]>([], () => listCustomers(f.search));
  $effect(() => {
    customers.reload();
  });

  // The figures do not depend on the search term, so they load once, not with every keystroke.
  const figures = createQueryState<ReadonlyMap<number, InvoiceFigures>>(new Map(), () =>
    loadCustomerListFigures(periodForYear(year)),
  );
  $effect(() => {
    figures.reload();
  });

  const listQuery = {
    get loading() {
      return customers.loading || figures.loading;
    },
    get error() {
      return customers.error ?? figures.error;
    },
  };
  const rows = $derived(withFigures(customers.data, figures.data));

  type SortKey = "customerNumber" | "name" | "city" | "email" | "revenueNet" | "openBalance" | "lastInvoiceDate";
  const sort = createListSort<SortKey>("customers", { key: "name", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "customerNumber", label: "Nr.", class: "whitespace-nowrap" },
    { key: "name", label: "Name", class: "w-full" },
    { key: "city", label: "Ort", class: "whitespace-nowrap" },
    { key: "email", label: "E-Mail", class: `${WIDE_ONLY} whitespace-nowrap` },
    { key: "revenueNet", label: `Umsatz ${year}`, align: "right", class: "text-right whitespace-nowrap" },
    { key: "openBalance", label: "Offen", align: "right", class: "text-right whitespace-nowrap" },
    { key: "lastInvoiceDate", label: "Letzte Rechnung", class: `${WIDE_ONLY} whitespace-nowrap` },
  ];

  const visibleCustomers = $derived.by(() => {
    const matching = f.onlyFollowUp ? rows.filter((c) => c.followUpDate != null) : rows;
    return applySort(matching, sort.state, {
      customerNumber: (c) => c.customerNumber,
      name: (c) => c.name,
      city: (c) => c.city,
      email: (c) => c.email,
      revenueNet: (c) => c.revenueNet,
      openBalance: (c) => c.openBalance,
      lastInvoiceDate: (c) => c.lastInvoiceDate,
    });
  });

  const deletion = createDeleteFlow<Customer>({
    remove: (c) => deleteCustomer(c.id),
    entityLabel: "Kunde",
    describe: (c) => c.name,
    reload: customers.reload,
  });

  const openCustomer = (c: Customer) => push(`/customers/${c.id}`);
  const editCustomer = (c: Customer) => push(`/customers/${c.id}/edit`);
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

<QueryBoundary query={listQuery} isEmpty={visibleCustomers.length === 0}>
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
        <tr class="cursor-pointer" onclick={() => openCustomer(c)}>
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
          <td class="text-right whitespace-nowrap tabular-nums">
            {#if c.revenueNet}{centsToEur(c.revenueNet)}{:else}<span class="text-muted-foreground">{NO_FIGURE}</span>{/if}
          </td>
          <td class="text-right font-semibold whitespace-nowrap tabular-nums">
            {#if c.openBalance}{centsToEur(c.openBalance)}{:else}<span class="font-normal text-muted-foreground">{NO_FIGURE}</span>{/if}
          </td>
          <td class="{WIDE_ONLY} text-muted-foreground whitespace-nowrap tabular-nums">
            {c.lastInvoiceDate ? formatDate(c.lastInvoiceDate) : NO_FIGURE}
          </td>
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
