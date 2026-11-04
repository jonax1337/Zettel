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
  import { Button, Card, Badge, Checkbox, SortableTh, BulkActionBar, ConfirmDialog, toast, EmptyState } from "$lib/ui";
  import { Plus, Send, Ban, Trash2 } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import DocumentListFilters from "./invoice/DocumentListFilters.svelte";
  import { createRowSelection } from "./invoice/list-selection.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import {
    ALL,
    numberOrAll,
    statusFilterItems,
  } from "./invoice/list-support";
  import { OFFER_STATUS_LABEL, OFFER_STATUS_VARIANT } from "./offer/status";

  const statusItems = statusFilterItems(OFFER_STATUS_LABEL);

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

  const offers = createQueryState<OfferListRow[]>([], () => listOffers(filter));

  async function expireOutdatedOffers() {
    try {
      await expireDueOffers();
    } catch (e) {
      toast.error("Abgelaufene Angebote konnten nicht aktualisiert werden", String(e));
    }
    await offers.reload();
  }

  $effect(() => {
    expireOutdatedOffers();
    listCustomers().then((c) => (customers = c));
    getOfferYears().then((y) => (years = y));
  });

  $effect(() => {
    offers.reload();
  });

  type SortKey = "number" | "issueDate" | "customer" | "total" | "status" | "validUntil";
  const sort = createListSort<SortKey>("offers", { key: "issueDate", dir: "desc" });
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

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Angebote</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {offers.data.length} {pluralize(offers.data.length, "Angebot", "Angebote")}
    </p>
  </div>
  <Button onclick={() => push("/offers/new")}>
    <Plus />
    Neues Angebot
  </Button>
</header>

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

{#if offers.error}
  <p class="text-sm text-destructive">Fehler: {offers.error}</p>
{:else if offers.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if offers.data.length === 0}
  <EmptyState variant={search ? "no-results" : "empty"} message="Keine Angebote gefunden." />
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <th class="px-3 @3xl:px-4 py-3 w-10">
            <Checkbox
              checked={selection.allSelected}
              onCheckedChange={selection.toggleAll}
              aria-label="Alle auswählen"
            />
          </th>
          <SortableTh column="number" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 whitespace-nowrap">Nummer</SortableTh>
          <SortableTh column="issueDate" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 whitespace-nowrap">Datum</SortableTh>
          <SortableTh column="customer" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 min-w-32">Kunde</SortableTh>
          <SortableTh column="total" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} align="right" class="px-3 @3xl:px-4 py-3 text-right whitespace-nowrap">Betrag</SortableTh>
          <SortableTh column="status" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 whitespace-nowrap">Status</SortableTh>
          <SortableTh column="validUntil" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 whitespace-nowrap">Gültig bis</SortableTh>
        </tr>
      </thead>
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
              <Badge variant={OFFER_STATUS_VARIANT[off.status]}>{OFFER_STATUS_LABEL[off.status]}</Badge>
            </td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(off.validUntil)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

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
