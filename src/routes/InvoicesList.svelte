<script lang="ts">
  import { link, push, router } from "svelte-spa-router";
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
  import { canDeleteInvoice } from "$lib/db/invoice-lifecycle";
  import type { Customer, InvoiceStatus } from "$lib/db/schema";
  import { listCustomers } from "$lib/db/queries";
  import { ensureCompanyDataComplete } from "$lib/utils/company-guard";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate, nowUnix } from "$lib/utils/date";
  import {
    Button,
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
  import { ALL, WIDE_ONLY, numberOrAll, overdueDays, overdueLabel, statusFilterItems } from "./invoice/list-support";
  import { canRecordPayments, isOverdue as isInvoiceOverdue } from "./invoice/invoice-actions";
  import { INVOICE_STATUS } from "./invoice/status";

  import FilterMenu from "./parts/list/FilterMenu.svelte";
  import InvoiceTabs from "./parts/list/InvoiceTabs.svelte";
  import { invoiceListTab } from "./parts/list/invoice-tabs";
  import ListSummary from "./parts/list/ListSummary.svelte";
  import { invoiceSummary, openInvoiceSummary } from "./parts/list/list-summary";

  const statusItems = statusFilterItems(INVOICE_STATUS);
  const FILTER_OPTIONS = [
    { key: "onlyCreditNotes", label: "Nur Stornorechnungen" },
    { key: "onlyFollowUp", label: "Nur mit Wiedervorlage" },
  ];
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
  };
  const filters = createListFilters<InvoiceListFilters>("invoices", {
    status: ALL,
    year: ALL,
    customerId: ALL,
    search: "",
    onlyCreditNotes: false,
    onlyFollowUp: false,
  });
  const f = filters.values;

  // The "Offen" tab is this list restricted to open invoices. Only the URL (`?view=open`) says so,
  // never a saved filter, so the plain `/invoices` link always shows all invoices.
  const onlyOpen = $derived(invoiceListTab(router.querystring) === "open");

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
        (!onlyOpen || canRecordPayments(i, i.settledByCreditNote)),
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
    { key: "customer", label: "Kunde", class: "w-full" },
    { key: "issueDate", label: "Datum", class: `${WIDE_ONLY} whitespace-nowrap` },
    { key: "dueDate", label: "Fällig", class: "whitespace-nowrap" },
    { key: "status", label: "Status", class: "whitespace-nowrap" },
    { key: "total", label: "Betrag", align: "right", class: "text-right whitespace-nowrap" },
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

  const summary = $derived(
    onlyOpen ? openInvoiceSummary(sortedInvoices, now) : invoiceSummary(sortedInvoices, now),
  );

  // Bumped after every bulk action so the tab counts reload; typing in the search field does not.
  let changes = $state(0);
  async function reloadAfterChange() {
    await invoices.reload();
    changes++;
  }

  const selection = createRowSelection(() => sortedInvoices);
  let bulkDeleteConfirmOpen = $state(false);

  // Bulk actions are offered only when every selected invoice allows them.
  const canBulkMarkSent = $derived(
    selection.selected.length > 0 &&
      selection.selected.every((i) => i.status === "draft" && !i.isCreditNote),
  );
  const canBulkMarkPaid = $derived(
    selection.selected.length > 0 &&
      selection.selected.every((i) => canRecordPayments(i, i.settledByCreditNote)),
  );
  const canBulkDelete = $derived(
    selection.selected.length > 0 && selection.selected.every(canDeleteInvoice),
  );

  const selectedLabel = $derived(pluralize(selection.selected.length, "Rechnung", "Rechnungen"));

  async function bulkMarkSent() {
    if (!(await ensureCompanyDataComplete())) return;
    await selection.runBulk("als versendet markiert", (id) => markSent(id), reloadAfterChange);
  }

  async function bulkDelete() {
    bulkDeleteConfirmOpen = false;
    await selection.runBulk("gelöscht", deleteInvoice, reloadAfterChange);
  }
</script>

<PageHeader title="Rechnungen">
  {#snippet actions()}
    <Button onclick={() => push("/invoices/new")}>
      <Plus />
      Neue Rechnung
    </Button>
  {/snippet}
</PageHeader>

<InvoiceTabs active={onlyOpen ? "open" : "all"} refreshKey={changes} />

<DocumentListFilters
  bind:status={f.status}
  {statusItems}
  bind:year={f.year}
  bind:customerId={f.customerId}
  bind:search={f.search}
  {years}
  {customers}
>
  <FilterMenu values={f} options={FILTER_OPTIONS} />
</DocumentListFilters>

<QueryBoundary query={invoices} isEmpty={visibleInvoices.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={filters.isFiltered}
      onResetFilters={filters.reset}
      filteredMessage="Keine Rechnungen für diese Filter."
      emptyMessage={onlyOpen ? "Keine offenen Rechnungen." : "Noch keine Rechnungen angelegt."}
      createLabel={onlyOpen ? undefined : "Neue Rechnung"}
      onCreate={() => push("/invoices/new")}
    />
  {/snippet}
  <table class="data-list">
    <SortableHeaderRow {sort} {columns} {selection} />
    <tbody>
      {#each sortedInvoices as inv (inv.id)}
        {@const overdue = isInvoiceOverdue(inv, inv.settledByCreditNote, now)}
        <tr class="cursor-pointer" onclick={() => push(`/invoices/${inv.id}`)}>
          <td onclick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selection.isSelected(inv.id)}
              onCheckedChange={() => selection.toggle(inv.id)}
              aria-label={`Rechnung ${displayInvoiceNumber(inv)} auswählen`}
            />
          </td>
          <td class="font-semibold whitespace-nowrap tabular-nums">
            <span class="inline-flex items-center gap-2">
              <a
                href={`/invoices/${inv.id}`}
                use:link
                onclick={(e) => e.stopPropagation()}
                class="hover:underline focus-visible:underline"
              >
                {displayInvoiceNumber(inv)}
              </a>
              {#if inv.isCreditNote}
                <Badge variant="outline">Storno</Badge>
              {/if}
            </span>
          </td>
          <td class="w-full"><span class="line-clamp-2" title={inv.customerName}>{inv.customerName}</span></td>
          <td class="{WIDE_ONLY} text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(inv.issueDate)}</td>
          <td class="text-muted-foreground whitespace-nowrap tabular-nums">
            {inv.isCreditNote ? "–" : formatDate(inv.dueDate)}
          </td>
          <td class="whitespace-nowrap">
            <span class="inline-flex items-center gap-2">
              {#if overdue}
                <Badge variant="late">{overdueLabel(overdueDays(inv.dueDate, now))}</Badge>
                {#if inv.status === "partial"}
                  <span class="text-xs text-muted-foreground">teilbezahlt</span>
                {/if}
              {:else}
                <StatusBadge status={inv.status} table={INVOICE_STATUS} />
              {/if}
            </span>
          </td>
          <td class="text-right font-semibold whitespace-nowrap tabular-nums">
            <span class="inline-flex items-center gap-1.5">
              {#if inv.currency && inv.currency !== "EUR"}
                <span class="text-xs font-normal text-muted-foreground">{inv.currency}</span>
              {/if}
              {formatMoney(inv.total, inv.currency)}
            </span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <ListSummary segments={summary} />
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
      onclick={() => selection.runBulk("als bezahlt markiert", (id) => markPaid(id), reloadAfterChange)}
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
