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
  import { formatDate, nowUnix } from "$lib/utils/date";
  import {
    Button,
    Card,
    Badge,
    Checkbox,
    BulkActionBar,
    ConfirmDialog,
    PageHeader,
    QueryBoundary,
    StatusBadge,
  } from "$lib/ui";
  import { Plus, Send, Trash2, CheckCircle2 } from "$lib/brand-icons";
  import { applySort } from "$lib/utils/sort";
  import DocumentListFilters from "./invoice/DocumentListFilters.svelte";
  import { createRowSelection } from "./invoice/list-selection.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import { ALL, numberOrAll, statusFilterItems } from "./invoice/list-support";
  import { canRecordPayments, isOverdue as isInvoiceOverdue } from "./invoice/invoice-actions";
  import { INVOICE_STATUS } from "./invoice/status";

  const statusItems = statusFilterItems(INVOICE_STATUS);
  const now = nowUnix();

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
        (!f.onlyOpen || canRecordPayments(i, i.settledByCreditNote)),
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
  const columns: SortColumn<SortKey>[] = [
    { key: "number", label: "Nummer", class: "whitespace-nowrap" },
    { key: "issueDate", label: "Datum", class: "whitespace-nowrap" },
    { key: "customer", label: "Kunde", class: "min-w-32" },
    { key: "total", label: "Betrag", align: "right", class: "text-right whitespace-nowrap" },
    { key: "status", label: "Status", class: "whitespace-nowrap" },
    { key: "dueDate", label: "Fällig", class: "hidden @3xl:table-cell whitespace-nowrap" },
  ];
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

<PageHeader
  title="Rechnungen"
  subtitle="{visibleInvoices.length} {pluralize(visibleInvoices.length, "Rechnung", "Rechnungen")}"
>
  {#snippet actions()}
    <Button onclick={() => push("/invoices/new")}>
      <Plus />
      Neue Rechnung
    </Button>
  {/snippet}
</PageHeader>

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

<QueryBoundary query={invoices} isEmpty={visibleInvoices.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={filters.isFiltered}
      onResetFilters={filters.reset}
      filteredMessage="Keine Rechnungen für diese Filter."
      emptyMessage="Noch keine Rechnungen angelegt."
      createLabel="Neue Rechnung"
      onCreate={() => push("/invoices/new")}
    />
  {/snippet}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <SortableHeaderRow {sort} {columns} cellClass="px-3 @3xl:px-4 py-3" {selection} />
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
              <span class="inline-flex items-center gap-1.5">
                <StatusBadge status={inv.status} table={INVOICE_STATUS} />
                {#if isInvoiceOverdue(inv, inv.settledByCreditNote, now)}
                  <Badge variant="destructive">Überfällig</Badge>
                {/if}
              </span>
            </td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
              {inv.isCreditNote ? "—" : formatDate(inv.dueDate)}
            </td>
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
