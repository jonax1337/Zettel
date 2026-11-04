<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    deleteOffer,
    expireDueOffers,
    getOfferYears,
    listOffers,
    markRejected,
    markSent,
    type OfferFilter,
    type OfferListRow,
  } from "$lib/db/offers";
  import type { Customer, OfferStatus } from "$lib/db/schema";
  import { listCustomers } from "$lib/db/queries";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import {
    Button,
    Card,
    Checkbox,
    BulkActionBar,
    ConfirmDialog,
    toast,
    EmptyState,
    PageHeader,
    QueryBoundary,
    StatusBadge,
  } from "$lib/ui";
  import { Plus, Send, Ban, Trash2 } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import DocumentListFilters from "./invoice/DocumentListFilters.svelte";
  import { createRowSelection } from "./invoice/list-selection.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import { ALL, numberOrAll, statusFilterItems } from "./invoice/list-support";
  import { OFFER_STATUS } from "./offer/status";

  const statusItems = statusFilterItems(OFFER_STATUS);

  let customers = $state<Customer[]>([]);
  let years = $state<number[]>([]);

  let status = $state<OfferStatus | typeof ALL>(ALL);
  let year = $state(ALL);
  let customerId = $state(ALL);
  let search = $state("");

  const filter = $derived<OfferFilter>({
    status,
    year: numberOrAll(year),
    customerId: numberOrAll(customerId),
    search,
  });

  let expiryChecked = false;

  const offers = createQueryState<OfferListRow[]>([], async () => {
    // Read the filter before the first await so the surrounding effect tracks it.
    const currentFilter = filter;
    if (!expiryChecked) {
      expiryChecked = true;
      try {
        await expireDueOffers();
      } catch (e) {
        toast.error("Abgelaufene Angebote konnten nicht aktualisiert werden", String(e));
      }
    }
    return listOffers(currentFilter);
  });

  $effect(() => {
    listCustomers().then((c) => (customers = c));
    getOfferYears().then((y) => (years = y));
  });

  $effect(() => {
    offers.reload();
  });

  type SortKey = "number" | "issueDate" | "customer" | "total" | "status" | "validUntil";
  const sort = createListSort<SortKey>("offers", { key: "issueDate", dir: "desc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "number", label: "Nummer", class: "whitespace-nowrap" },
    { key: "issueDate", label: "Datum", class: "whitespace-nowrap" },
    { key: "customer", label: "Kunde", class: "min-w-32" },
    { key: "total", label: "Betrag", align: "right", class: "text-right whitespace-nowrap" },
    { key: "status", label: "Status", class: "whitespace-nowrap" },
    { key: "validUntil", label: "Gültig bis", class: "hidden @3xl:table-cell whitespace-nowrap" },
  ];
  const sortedOffers = $derived(
    applySort(offers.data, sort.state, {
      number: (r) => r.number,
      issueDate: (r) => r.issueDate,
      customer: (r) => r.customerName,
      total: (r) => r.total,
      status: (r) => r.status,
      validUntil: (r) => r.validUntil,
    }),
  );

  const selection = createRowSelection(() => sortedOffers);
  let bulkDeleteConfirmOpen = $state(false);

  // Bulk actions are offered only when every selected offer allows them.
  const canBulkMarkSent = $derived(
    selection.selected.length > 0 && selection.selected.every((o) => o.status === "draft"),
  );
  const canBulkReject = $derived(
    selection.selected.length > 0 &&
      selection.selected.every((o) => o.status === "sent" || o.status === "draft"),
  );
  const canBulkDelete = $derived(
    selection.selected.length > 0 &&
      selection.selected.every(
        (o) => o.status === "draft" || o.status === "rejected" || o.status === "expired",
      ),
  );

  const selectedLabel = $derived(pluralize(selection.selected.length, "Angebot", "Angebote"));

  async function bulkDelete() {
    bulkDeleteConfirmOpen = false;
    await selection.runBulk("gelöscht", deleteOffer, offers.reload);
  }
</script>

<PageHeader
  title="Angebote"
  subtitle="{offers.data.length} {pluralize(offers.data.length, "Angebot", "Angebote")}"
>
  {#snippet actions()}
    <Button onclick={() => push("/offers/new")}>
      <Plus />
      Neues Angebot
    </Button>
  {/snippet}
</PageHeader>

<div class="mb-5">
  <DocumentListFilters
    bind:status
    {statusItems}
    bind:year
    bind:customerId
    bind:search
    {years}
    {customers}
  />
</div>

<QueryBoundary query={offers} isEmpty={offers.data.length === 0}>
  {#snippet empty()}
    <EmptyState variant={search ? "no-results" : "empty"} message="Keine Angebote gefunden." />
  {/snippet}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <SortableHeaderRow {sort} {columns} cellClass="px-3 @3xl:px-4 py-3" {selection} />
      <tbody class="stagger">
        {#each sortedOffers as off (off.id)}
          <tr
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            onclick={() => push(`/offers/${off.id}`)}
          >
            <td class="px-3 @3xl:px-4 py-3" onclick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selection.isSelected(off.id)}
                onCheckedChange={() => selection.toggle(off.id)}
                aria-label={`Angebot ${off.number} auswählen`}
              />
            </td>
            <td class="px-3 @3xl:px-4 py-3 font-mono text-xs whitespace-nowrap">{off.number}</td>
            <td class="px-3 @3xl:px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(off.issueDate)}</td>
            <td class="px-3 @3xl:px-4 py-3 min-w-32"><span class="line-clamp-2" title={off.customerName}>{off.customerName}</span></td>
            <td class="px-3 @3xl:px-4 py-3 text-right font-mono whitespace-nowrap">{formatMoney(off.total, off.currency)}</td>
            <td class="px-3 @3xl:px-4 py-3 whitespace-nowrap">
              <StatusBadge status={off.status} table={OFFER_STATUS} />
            </td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(off.validUntil)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
</QueryBoundary>

<BulkActionBar count={selection.selected.length} label={selectedLabel} onClear={selection.clear}>
  {#if canBulkMarkSent}
    <Button
      size="sm"
      variant="outline"
      onclick={() => selection.runBulk("als versandt markiert", markSent, offers.reload)}
      disabled={selection.busy}
    >
      <Send class="size-3.5" />
      Versenden
    </Button>
  {/if}
  {#if canBulkReject}
    <Button
      size="sm"
      variant="outline"
      onclick={() => selection.runBulk("abgelehnt", markRejected, offers.reload)}
      disabled={selection.busy}
    >
      <Ban class="size-3.5" />
      Ablehnen
    </Button>
  {/if}
  {#if canBulkDelete}
    <Button size="sm" variant="destructive" onclick={() => (bulkDeleteConfirmOpen = true)} disabled={selection.busy}>
      <Trash2 class="size-3.5" />
      Löschen
    </Button>
  {/if}
</BulkActionBar>

<ConfirmDialog
  bind:open={bulkDeleteConfirmOpen}
  title="{selection.selected.length} {selectedLabel} löschen?"
  description="Nur Entwürfe, abgelehnte und abgelaufene Angebote werden gelöscht. Angenommene bleiben unangetastet."
  confirmLabel="Löschen"
  destructive
  onConfirm={bulkDelete}
/>
