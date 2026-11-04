<script lang="ts">
  import { push } from "svelte-spa-router";
  import { deleteCustomer, listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { Button, Card, Checkbox, ConfirmDialog, EmptyState, PageHeader, QueryBoundary } from "$lib/ui";
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
  let onlyFollowUp = $state(false);

  const customers = createQueryState<Customer[]>([], () => listCustomers(search));
  $effect(() => {
    customers.reload();
  });

  type SortKey = "customerNumber" | "name" | "city" | "email";
  const sort = createListSort<SortKey>("customers", { key: "name", dir: "asc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "customerNumber", label: "Nr.", class: "whitespace-nowrap" },
    { key: "name", label: "Name", class: "min-w-32" },
    { key: "city", label: "Ort", class: "hidden @3xl:table-cell whitespace-nowrap" },
    { key: "email", label: "E-Mail", class: "hidden @3xl:table-cell whitespace-nowrap" },
  ];

  const visibleCustomers = $derived.by(() => {
    const matching = onlyFollowUp
      ? customers.data.filter((c) => c.followUpDate != null)
      : customers.data;
    return applySort(matching, sort.state, {
      customerNumber: (c) => c.customerNumber,
      name: (c) => c.name,
      city: (c) => c.city,
      email: (c) => c.email,
    });
  });
  const isFiltered = $derived(search !== "" || onlyFollowUp);

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

<PageHeader
  title="Kunden"
  subtitle="{visibleCustomers.length} {pluralize(visibleCustomers.length, "Eintrag", "Einträge")}"
>
  {#snippet actions()}
    <Button onclick={() => push("/customers/new")}>
      <Plus />
      Neuer Kunde
    </Button>
  {/snippet}
</PageHeader>

<div class="mb-4 flex flex-wrap items-end gap-3">
  <SearchInput
    bind:value={search}
    placeholder="Suche (Name, Nummer, Ort, E-Mail)…"
    class="max-w-md flex-1 min-w-[200px]"
  />
  <label class="flex items-center gap-2 text-sm pb-2 cursor-pointer">
    <Checkbox bind:checked={onlyFollowUp} />
    <span>Nur mit Wiedervorlage</span>
  </label>
</div>

<QueryBoundary query={customers} isEmpty={visibleCustomers.length === 0}>
  {#snippet empty()}
    <EmptyState
      variant={isFiltered ? "no-results" : "empty"}
      message={isFiltered ? "Keine Treffer." : "Noch keine Kunden angelegt."}
    />
  {/snippet}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <SortableHeaderRow {sort} {columns} actionsColumn />
      <tbody class="stagger">
        {#each visibleCustomers as c (c.id)}
          <tr class="border-t hover:bg-muted/30 transition-colors">
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{c.customerNumber}</td>
            <td class="px-4 py-3 min-w-32">
              <button
                type="button"
                class="text-left hover:text-foreground font-medium transition-colors"
                onclick={() => editCustomer(c)}
              >
                <span class="line-clamp-2" title={c.name}>{c.name}</span>
              </button>
            </td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground whitespace-nowrap">{c.city}</td>
            <td class="hidden @3xl:table-cell px-4 py-3 text-muted-foreground whitespace-nowrap">{c.email ?? ""}</td>
            <td class="px-4 py-3 text-right">
              <RowActionsMenu onEdit={() => editCustomer(c)} onDelete={() => deletion.ask(c)} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
</QueryBoundary>

<ConfirmDialog
  bind:open={deletion.open}
  title="Kunde löschen?"
  description={deletion.target ? `"${deletion.target.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={deletion.confirm}
/>
