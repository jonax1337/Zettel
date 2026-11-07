<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    deleteExpense,
    getExpenseYears,
    listExpenses,
    markExpensePaid,
    type ExpenseFilter,
    type ExpenseListRow,
  } from "$lib/db/expenses";
  import type { ExpenseStatus, Vendor } from "$lib/db/schema";
  import { listVendors } from "$lib/db/queries";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { applySort } from "$lib/utils/sort";
  import {
    Button,
    Card,
    Checkbox,
    BulkActionBar,
    ConfirmDialog,
    toast,
    PageHeader,
    QueryBoundary,
    StatusBadge,
  } from "$lib/ui";
  import { Plus, CheckCircle2, Trash2 } from "$lib/brand-icons";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { paidDateWarning } from "./invoice/date-warnings";
  import DocumentListFilters from "./invoice/DocumentListFilters.svelte";
  import { createRowSelection } from "./invoice/list-selection.svelte";
  import { ALL, numberOrAll, statusFilterItems } from "./invoice/list-support";
  import { pluralize } from "./parts/entity/format";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import ListEmptyState from "./parts/entity/ListEmptyState.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import SortableHeaderRow, { type SortColumn } from "./parts/entity/SortableHeaderRow.svelte";
  import { EXPENSE_STATUS, EXPENSE_STATUS_FILTER_ORDER } from "./parts/expense/expense-status";

  const VENDOR_COUNTERPARTY = { label: "Lieferant", allLabel: "Alle Lieferanten" };

  let vendors = $state<Vendor[]>([]);
  let years = $state<number[]>([]);

  const filters = createListFilters<{
    status: ExpenseStatus | typeof ALL;
    year: string;
    vendorId: string;
    search: string;
  }>("expenses", { status: ALL, year: ALL, vendorId: ALL, search: "" });
  const f = filters.values;

  const filter = $derived<ExpenseFilter>({
    status: f.status,
    year: numberOrAll(f.year),
    vendorId: numberOrAll(f.vendorId),
    search: f.search,
  });

  const expenses = createQueryState<ExpenseListRow[]>([], () => listExpenses(filter));
  $effect(() => {
    expenses.reload();
  });

  $effect(() => {
    listVendors()
      .then((v) => (vendors = v))
      .catch((e) => toast.error("Lieferanten konnten nicht geladen werden", String(e)));
    getExpenseYears()
      .then((y) => (years = y))
      .catch((e) => toast.error("Jahre konnten nicht geladen werden", String(e)));
  });

  const statusItems = statusFilterItems(EXPENSE_STATUS, EXPENSE_STATUS_FILTER_ORDER);

  type SortKey = "internalNumber" | "number" | "issueDate" | "vendor" | "total" | "status" | "dueDate";
  const sort = createListSort<SortKey>("expenses", { key: "issueDate", dir: "desc" });
  const columns: SortColumn<SortKey>[] = [
    { key: "internalNumber", label: "Interne Nr.", class: "whitespace-nowrap" },
    { key: "number", label: "Beleg-Nr.", class: "hidden @3xl:table-cell whitespace-nowrap" },
    { key: "issueDate", label: "Datum", class: "whitespace-nowrap" },
    { key: "vendor", label: "Lieferant", class: "min-w-32" },
    { key: "total", label: "Brutto", align: "right", class: "text-right whitespace-nowrap" },
    { key: "status", label: "Status", class: "whitespace-nowrap" },
    { key: "dueDate", label: "Fällig", class: "hidden @3xl:table-cell whitespace-nowrap" },
  ];
  const sortedExpenses = $derived(
    applySort(expenses.data, sort.state, {
      internalNumber: (r) => r.internalNumber,
      number: (r) => r.number,
      issueDate: (r) => r.issueDate,
      vendor: (r) => r.vendorName,
      total: (r) => r.total,
      status: (r) => r.status,
      dueDate: (r) => r.dueDate,
    }),
  );

  const selection = createRowSelection(() => sortedExpenses);
  let bulkDeleteConfirmOpen = $state(false);
  let paidDialogOpen = $state(false);
  let paidDate = $state(toIsoDate(nowUnix()));

  const canBulkMarkPaid = $derived(
    selection.selected.length > 0 && selection.selected.every((e) => e.status === "open"),
  );
  const canBulkDelete = $derived(
    selection.selected.length > 0 &&
      selection.selected.every((e) => e.status === "draft" || e.status === "cancelled"),
  );
  const selectionLabel = $derived(
    pluralize(selection.selected.length, "Eingangsrechnung", "Eingangsrechnungen"),
  );
  const paidWarning = $derived.by(() => {
    if (!paidDate || selection.selected.length === 0) return null;
    const latestIssueDate = Math.max(...selection.selected.map((e) => e.issueDate));
    return paidDateWarning(fromIsoDate(paidDate), { sentAt: null, issueDate: latestIssueDate }, nowUnix());
  });

  function openPaidDialog() {
    paidDate = toIsoDate(nowUnix());
    paidDialogOpen = true;
  }

  async function confirmBulkPaid() {
    const paidAt = fromIsoDate(paidDate);
    paidDialogOpen = false;
    await selection.runBulk("als bezahlt markiert", (id) => markExpensePaid(id, paidAt), expenses.reload);
  }

  async function confirmBulkDelete() {
    bulkDeleteConfirmOpen = false;
    await selection.runBulk("gelöscht", deleteExpense, expenses.reload);
  }
</script>

<PageHeader
  title="Eingangsrechnungen"
  subtitle="{expenses.data.length} {pluralize(expenses.data.length, "Beleg", "Belege")}"
>
  {#snippet actions()}
    <Button onclick={() => push("/expenses/new")}>
      <Plus />
      Neue Eingangsrechnung
    </Button>
  {/snippet}
</PageHeader>

<div class="mb-5">
  <DocumentListFilters
    bind:status={f.status}
    {statusItems}
    bind:year={f.year}
    bind:customerId={f.vendorId}
    bind:search={f.search}
    {years}
    customers={vendors}
    counterparty={VENDOR_COUNTERPARTY}
  />
</div>

<QueryBoundary query={expenses} isEmpty={expenses.data.length === 0}>
  {#snippet empty()}
    <ListEmptyState
      filtered={filters.isFiltered}
      onResetFilters={filters.reset}
      filteredMessage="Keine Eingangsrechnungen für diese Filter."
      emptyMessage="Noch keine Eingangsrechnungen erfasst."
      createLabel="Neue Eingangsrechnung"
      onCreate={() => push("/expenses/new")}
    />
  {/snippet}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <SortableHeaderRow {sort} {columns} cellClass="px-3 @3xl:px-4 py-3" {selection} />
      <tbody class="stagger">
        {#each sortedExpenses as e (e.id)}
          <tr
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            onclick={() => push(`/expenses/${e.id}`)}
          >
            <td class="px-3 @3xl:px-4 py-3" onclick={(ev) => ev.stopPropagation()}>
              <Checkbox
                checked={selection.isSelected(e.id)}
                onCheckedChange={() => selection.toggle(e.id)}
                aria-label={`Eingangsrechnung ${e.internalNumber} auswählen`}
              />
            </td>
            <td class="px-3 @3xl:px-4 py-3 font-mono text-xs whitespace-nowrap">
              <a
                href={`/expenses/${e.id}`}
                use:link
                onclick={(ev) => ev.stopPropagation()}
                class="hover:underline focus-visible:underline"
              >
                {e.internalNumber}
              </a>
            </td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{e.number ?? "—"}</td>
            <td class="px-3 @3xl:px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(e.issueDate)}</td>
            <td class="px-3 @3xl:px-4 py-3 min-w-32"><span class="line-clamp-2" title={e.vendorName}>{e.vendorName}</span></td>
            <td class="px-3 @3xl:px-4 py-3 text-right font-mono whitespace-nowrap">{centsToEur(e.total)}</td>
            <td class="px-3 @3xl:px-4 py-3 whitespace-nowrap">
              <StatusBadge status={e.status} table={EXPENSE_STATUS} />
            </td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
              {e.dueDate ? formatDate(e.dueDate) : "—"}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
</QueryBoundary>

<BulkActionBar count={selection.selected.length} label={selectionLabel} onClear={selection.clear}>
  {#if canBulkMarkPaid}
    <Button size="sm" variant="outline" onclick={openPaidDialog} disabled={selection.busy}>
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

<DateConfirmDialog
  bind:open={paidDialogOpen}
  bind:date={paidDate}
  title="Als bezahlt markieren"
  description="{selection.selected.length} {selectionLabel} werden mit diesem Zahldatum als bezahlt markiert."
  dateInputId="expense-paid-date"
  dateLabel="Zahldatum"
  hint="Standard ist heute. Bei Nacherfassung das echte Zahldatum eintragen."
  confirmLabel="Bestätigen"
  warning={paidWarning}
  onConfirm={confirmBulkPaid}
/>

<ConfirmDialog
  bind:open={bulkDeleteConfirmOpen}
  title="{selection.selected.length} {selectionLabel} löschen?"
  description="Nur Entwürfe und stornierte Belege werden gelöscht. Offene/bezahlte bleiben unangetastet."
  confirmLabel="Löschen"
  destructive
  onConfirm={confirmBulkDelete}
/>
