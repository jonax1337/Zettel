<script lang="ts">
  import { push } from "svelte-spa-router";
  import { deleteCustomer, listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { Button, Card, Checkbox, ConfirmDialog, DropdownItem, SortableTh, toast, EmptyState } from "$lib/ui";
  import { FilePlus2, Plus } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import RowActionsMenu from "./parts/entity/RowActionsMenu.svelte";
  import SearchInput from "./parts/entity/SearchInput.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";

  let search = $state("");
  let onlyFollowUp = $state(false);

  const customers = createQueryState<Customer[]>([], () => listCustomers(search));
  $effect(() => {
    customers.reload();
  });

  type SortKey = "customerNumber" | "name" | "city" | "email";
  const sort = createListSort<SortKey>("customers", { key: "name", dir: "asc" });

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

  let confirmOpen = $state(false);
  let toDelete = $state<Customer | null>(null);

  function editCustomer(c: Customer) {
    push(`/customers/${c.id}`);
  }

  function askDelete(c: Customer) {
    toDelete = c;
    confirmOpen = true;
  }

  async function performDelete() {
    if (!toDelete) return;
    try {
      await deleteCustomer(toDelete.id);
      toast.success("Kunde gelöscht", `"${toDelete.name}" wurde entfernt.`);
      toDelete = null;
      await customers.reload();
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Kunden</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {visibleCustomers.length} {pluralize(visibleCustomers.length, "Eintrag", "Einträge")}
    </p>
  </div>
  <Button onclick={() => push("/customers/new")}>
    <Plus />
    Neuer Kunde
  </Button>
</header>

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

{#if customers.error}
  <p class="text-sm text-destructive">Fehler: {customers.error}</p>
{:else if customers.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if visibleCustomers.length === 0}
  <EmptyState
    variant={isFiltered ? "no-results" : "empty"}
    message={isFiltered ? "Keine Treffer." : "Noch keine Kunden angelegt."}
  />
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <SortableTh column="customerNumber" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 whitespace-nowrap">Nr.</SortableTh>
          <SortableTh column="name" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-4 py-3 min-w-32">Name</SortableTh>
          <SortableTh column="city" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">Ort</SortableTh>
          <SortableTh column="email" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-4 py-3 whitespace-nowrap">E-Mail</SortableTh>
          <th class="px-4 py-3 font-medium w-12"></th>
        </tr>
      </thead>
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
              <RowActionsMenu onEdit={() => editCustomer(c)} onDelete={() => askDelete(c)}>
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
  </Card>
{/if}

<ConfirmDialog
  bind:open={confirmOpen}
  title="Kunde löschen?"
  description={toDelete ? `"${toDelete.name}" wird unwiderruflich entfernt.` : ""}
  confirmLabel="Löschen"
  destructive
  onConfirm={performDelete}
/>
