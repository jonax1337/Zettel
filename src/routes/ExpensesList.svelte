<script lang="ts">
  import { push } from "svelte-spa-router";
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
    Badge,
    Checkbox,
    SortableTh,
    BulkActionBar,
    ConfirmDialog,
    toast,
    EmptyState,
  } from "$lib/ui";
  import { Plus, CheckCircle2, Trash2 } from "$lib/brand-icons";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { paidDateWarning } from "./invoice/date-warnings";
  import DocumentListFilters from "./invoice/DocumentListFilters.svelte";
  import { createRowSelection } from "./invoice/list-selection.svelte";
  import { ALL, numberOrAll, statusFilterItems } from "./invoice/list-support";
  import { pluralize } from "./parts/entity/format";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import {
    EXPENSE_STATUS_FILTER_ORDER,
    EXPENSE_STATUS_LABEL,
    EXPENSE_STATUS_VARIANT,
  } from "./parts/expense/expense-status";

  const VENDOR_COUNTERPARTY = { label: "Lieferant", allLabel: "Alle Lieferanten" };

  let vendors = $state<Vendor[]>([]);
  let years = $state<number[]>([]);

  let status = $state<ExpenseStatus | typeof ALL>(ALL);
  let year = $state(ALL);
  let vendorId = $state(ALL);
  let search = $state("");

  const filter = $derived<ExpenseFilter>({
    status,
    year: numberOrAll(year),
    vendorId: numberOrAll(vendorId),
    search,
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

  const statusItems = statusFilterItems(
    Object.fromEntries(
      EXPENSE_STATUS_FILTER_ORDER.map((s) => [s, EXPENSE_STATUS_LABEL[s]]),
    ) as Record<ExpenseStatus, string>,
  );

  type SortKey = "internalNumber" | "number" | "issueDate" | "vendor" | "total" | "status" | "dueDate";
  const sort = createListSort<SortKey>("expenses", { key: "issueDate", dir: "desc" });
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

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Eingangsrechnungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {expenses.data.length} {pluralize(expenses.data.length, "Beleg", "Belege")}
    </p>
  </div>
  <Button onclick={() => push("/expenses/new")}>
    <Plus />
    Neue Eingangsrechnung
  </Button>
</header>

<div class="mb-5">
  <DocumentListFilters
    bind:status
    {statusItems}
    bind:year
    bind:customerId={vendorId}
    bind:search
    {years}
    customers={vendors}
    counterparty={VENDOR_COUNTERPARTY}
  />
</div>

{#if expenses.error}
  <p class="text-sm text-destructive">Fehler: {expenses.error}</p>
{:else if expenses.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if expenses.data.length === 0}
  <EmptyState variant={search ? "no-results" : "empty"} message="Keine Eingangsrechnungen gefunden." />
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
          <SortableTh column="internalNumber" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 whitespace-nowrap">Interne Nr.</SortableTh>
          <SortableTh column="number" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 whitespace-nowrap">Beleg-Nr.</SortableTh>
          <SortableTh column="issueDate" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 whitespace-nowrap">Datum</SortableTh>
          <SortableTh column="vendor" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 min-w-32">Lieferant</SortableTh>
          <SortableTh column="total" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} align="right" class="px-3 @3xl:px-4 py-3 text-right whitespace-nowrap">Brutto</SortableTh>
          <SortableTh column="status" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="px-3 @3xl:px-4 py-3 whitespace-nowrap">Status</SortableTh>
          <SortableTh column="dueDate" activeKey={sort.state.key} activeDir={sort.state.dir} onChange={sort.change} class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 whitespace-nowrap">Fällig</SortableTh>
        </tr>
      </thead>
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
            <td class="px-3 @3xl:px-4 py-3 font-mono text-xs whitespace-nowrap">{e.internalNumber}</td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{e.number ?? "—"}</td>
            <td class="px-3 @3xl:px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(e.issueDate)}</td>
            <td class="px-3 @3xl:px-4 py-3 min-w-32"><span class="line-clamp-2" title={e.vendorName}>{e.vendorName}</span></td>
            <td class="px-3 @3xl:px-4 py-3 text-right font-mono whitespace-nowrap">{centsToEur(e.total)}</td>
            <td class="px-3 @3xl:px-4 py-3 whitespace-nowrap">
              <Badge variant={EXPENSE_STATUS_VARIANT[e.status]}>{EXPENSE_STATUS_LABEL[e.status]}</Badge>
            </td>
            <td class="hidden @3xl:table-cell px-3 @3xl:px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
              {e.dueDate ? formatDate(e.dueDate) : "—"}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

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
