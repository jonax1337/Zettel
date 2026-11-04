<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    deleteInvoice,
    displayInvoiceNumber,
    getInvoiceYears,
    listInvoices,
    markPaid,
    markSent,
    type InvoiceFilter,
    type InvoiceListRow,
  } from "$lib/db/invoices";
  import type { Customer, InvoiceStatus } from "$lib/db/schema";
  import { listCustomers } from "$lib/db/queries";
  import { ensureCompanyDataComplete } from "$lib/utils/company-guard";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import { Button, Card, Badge, Checkbox, SortableTh, BulkActionBar, ConfirmDialog, EmptyState } from "$lib/ui";
  import { Plus, Send, Trash2, CheckCircle2 } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import DocumentListFilters from "./invoice/DocumentListFilters.svelte";
  import { createRowSelection } from "./invoice/list-selection.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import {
    ALL,
    numberOrAll,
    statusFilterItems,
  } from "./invoice/list-support";
  import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT } from "./invoice/status";

  const statusItems = statusFilterItems(INVOICE_STATUS_LABEL);

  let customers = $state<Customer[]>([]);
  let years = $state<number[]>([]);

  type InvoiceListFilters = {
    status: InvoiceStatus | typeof ALL;
    year: string;
    customerId: string;
    search: string;
    onlyCreditNotes: boolean;
    onlyFollowUp: boolean;
    onlyOpen: boolean;
  };
  const filters = createListFilters<InvoiceListFilters>("invoices", {
    status: ALL,
    year: ALL,
    customerId: ALL,
    search: "",
    onlyCreditNotes: false,
    onlyFollowUp: false,
    onlyOpen: false,
  });
  const f = filters.values;

  const filter = $derived<InvoiceFilter>({
    status: f.status,
    year: numberOrAll(f.year),
    customerId: numberOrAll(f.customerId),
    search: f.search,
  });

  const invoices = createQueryState<InvoiceListRow[]>([], () => listInvoices(filter));
  const visibleInvoices = $derived(
    invoices.data.filter(
      (i) => (!f.onlyCreditNotes || i.isCreditNote) &&
        (!f.onlyFollowUp || i.followUpDate != null) &&
        (!f.onlyOpen || i.status === "sent" || i.status === "partial"),
    ),
  );

  $effect(() => {
    listCustomers().then((c) => (customers = c));
    getInvoiceYears().then((y) => (years = y));
  });

  $effect(() => {
    invoices.reload();
  });

  type SortKey = "number" | "issueDate" | "customer" | "total" | "status" | "dueDate";
  const sort = createListSort<SortKey>("invoices", { key: "issueDate", dir: "desc" });
  const sortedInvoices = $derived(
    applySort(visibleInvoices, sort.state, {
      number: (r) => r.number,
      issueDate: (r) => r.issueDate,
      customer: (r) => r.customerName,
      total: (r) => r.total,
      status: (r) => r.status,
      dueDate: (r) => r.dueDate,
    }),
  );

  const selection = createRowSelection(() => sortedInvoices);
  let bulkDeleteConfirmOpen = $state(false);

  // Bulk actions are offered only when every selected invoice allows them.
  const canBulkMarkSent = $derived(
    selection.selected.length > 0 &&
      selection.selected.every((i) => i.status === "draft" && !i.isCreditNote),
  );
  const canBulkMarkPaid = $derived(
    selection.selected.length > 0 &&
      selection.selected.every((i) => i.status === "sent" || i.status === "partial"),
  );
  const canBulkDelete = $derived(
    selection.selected.length > 0 &&
      selection.selected.every((i) => i.status === "draft" || i.status === "cancelled"),
  );

  const selectedLabel = $derived(pluralize(selection.selected.length, "Rechnung", "Rechnungen"));

  async function bulkMarkSent() {
    if (!(await ensureCompanyDataComplete())) return;
    await selection.runBulk("als versendet markiert", (id) => markSent(id), invoices.reload);
  }

  async function bulkDelete() {
    bulkDeleteConfirmOpen = false;
    await selection.runBulk("gelöscht", deleteInvoice, invoices.reload);
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Rechnungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {visibleInvoices.length} {pluralize(visibleInvoices.length, "Rechnung", "Rechnungen")}
    </p>
  </div>
  <Button onclick={() => push("/invoices/new")}>
    <Plus />
    Neue Rechnung
  </Button>
</header>

<div class="mb-3">
  <DocumentListFilters
    bind:status={f.status}
    {statusItems}
    bind:year={f.year}
    bind:customerId={f.customerId}
    bind:search={f.search}
    {years}
    {customers}
  />
</div>

<div class="mb-5 flex flex-wrap items-center gap-4">
  <label class="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
    <Checkbox bind:checked={f.onlyCreditNotes} />
    Nur Stornorechnungen
  </label>
  <label class="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
    <Checkbox bind:checked={f.onlyFollowUp} />
    Nur mit Wiedervorlage
  </label>
  <label class="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
    <Checkbox bind:checked={f.onlyOpen} />
    Nur offene Posten
  </label>
</div>

{#if invoices.error}
  <p class="text-sm text-destructive">Fehler: {invoices.error}</p>
{:else if invoices.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if visibleInvoices.length === 0}
  {#if filters.isFiltered}
    <EmptyState
      variant="no-results"
      message="Keine Rechnungen für diese Filter."
      actionLabel="Filter zurücksetzen"
      onAction={filters.reset}
    />
  {:else}
    <EmptyState
      message="Noch keine Rechnungen angelegt."
      actionLabel="Neue Rechnung"
      onAction={() => push("/invoices/new")}
    />
  {/if}
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
          <SortableTh column="dueDate" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 whitespace-nowrap">Fällig</SortableTh>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each sortedInvoices as inv (inv.id)}
          <tr
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            onclick={() => push(`/invoices/${inv.id}`)}
          >
            <td class="px-3 @3xl:px-4 py-3" onclick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selection.isSelected(inv.id)}
                onCheckedChange={() => selection.toggle(inv.id)}
                aria-label={`Rechnung ${inv.number} auswählen`}
              />
            </td>
            <td class="px-3 @3xl:px-4 py-3 font-mono text-xs whitespace-nowrap">
              <span class="inline-flex items-center gap-1.5">
                <a
                  href={`/invoices/${inv.id}`}
                  use:link
                  onclick={(e) => e.stopPropagation()}
                  class="hover:underline focus-visible:underline"
                >
                  {displayInvoiceNumber(inv)}
                </a>
                {#if inv.isCreditNote}
                  <Badge variant="destructive" class="text-[10px] px-1.5 py-0">Storno</Badge>
                {/if}
              </span>
            </td>
            <td class="px-3 @3xl:px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(inv.issueDate)}</td>
            <td class="px-3 @3xl:px-4 py-3 min-w-32"><span class="line-clamp-2" title={inv.customerName}>{inv.customerName}</span></td>
            <td class="px-3 @3xl:px-4 py-3 text-right font-mono whitespace-nowrap">
              <span class="inline-flex items-center gap-1.5">
                {formatMoney(inv.total, inv.currency)}
                {#if inv.currency && inv.currency !== "EUR"}
                  <Badge variant="outline" class="text-[10px] px-1.5 py-0">{inv.currency}</Badge>
                {/if}
              </span>
            </td>
            <td class="px-3 @3xl:px-4 py-3 whitespace-nowrap">
              <Badge variant={INVOICE_STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
            </td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
              {inv.isCreditNote ? "—" : formatDate(inv.dueDate)}
            </td>
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
      onclick={bulkMarkSent}
      disabled={selection.busy}
    >
      <Send class="size-3.5" />
      Als versendet markieren
    </Button>
  {/if}
  {#if canBulkMarkPaid}
    <Button
      size="sm"
      variant="outline"
      onclick={() => selection.runBulk("als bezahlt markiert", (id) => markPaid(id), invoices.reload)}
      disabled={selection.busy}
    >
      <CheckCircle2 class="size-3.5" />
      Als bezahlt
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
  description="Nur Entwürfe und stornierte Rechnungen werden gelöscht. Versendete bleiben unangetastet."
  confirmLabel="Löschen"
  destructive
  onConfirm={bulkDelete}
/>
