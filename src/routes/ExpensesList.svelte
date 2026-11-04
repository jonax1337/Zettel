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
  import { formatDate } from "$lib/utils/date";
  import { applySort } from "$lib/utils/sort";
  import {
    Button,
    Card,
    Select,
    Badge,
    Label,
    Checkbox,
    SortableTh,
    BulkActionBar,
    ConfirmDialog,
    toast,
    EmptyState,
  } from "$lib/ui";
  import { Plus, CheckCircle2, Trash2 } from "$lib/brand-icons";
  import SearchInput from "./parts/entity/SearchInput.svelte";
  import { pluralize } from "./parts/entity/format";
  import { createListFilters } from "./parts/entity/list-filters.svelte";
  import { createListSort } from "./parts/entity/list-sort.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import {
    EXPENSE_STATUS_FILTER_ORDER,
    EXPENSE_STATUS_LABEL,
    EXPENSE_STATUS_VARIANT,
  } from "./parts/expense/expense-status";

  const ALL = "all";

  let vendors = $state<Vendor[]>([]);
  let years = $state<number[]>([]);

  const filters = createListFilters<{ status: string; year: string; vendorId: string; search: string }>("expenses", {
    status: ALL,
    year: ALL,
    vendorId: ALL,
    search: "",
  });
  const f = filters.values;

  function numericFilter(value: string): number | typeof ALL {
    return value === ALL ? ALL : Number.parseInt(value, 10);
  }

  function currentFilter(): ExpenseFilter {
    return {
      status: f.status === ALL ? ALL : (f.status as ExpenseStatus),
      year: numericFilter(f.year),
      vendorId: numericFilter(f.vendorId),
      search: f.search,
    };
  }

  const expenses = createQueryState<ExpenseListRow[]>([], () => listExpenses(currentFilter()));
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

  const statusItems = [
    { value: ALL, label: "Alle Status" },
    ...EXPENSE_STATUS_FILTER_ORDER.map((s) => ({ value: s, label: EXPENSE_STATUS_LABEL[s] })),
  ];

  const yearItems = $derived([
    { value: ALL, label: "Alle Jahre" },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ]);

  const vendorItems = $derived([
    { value: ALL, label: "Alle Lieferanten" },
    ...vendors.map((v) => ({ value: String(v.id), label: v.name })),
  ]);

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

  let selectedIds = $state<Set<number>>(new Set());
  let bulkBusy = $state(false);
  let bulkDeleteConfirmOpen = $state(false);

  const selectedExpenses = $derived(sortedExpenses.filter((e) => selectedIds.has(e.id)));
  const canBulkMarkPaid = $derived(
    selectedExpenses.length > 0 && selectedExpenses.every((e) => e.status === "open"),
  );
  const canBulkDelete = $derived(
    selectedExpenses.length > 0 &&
      selectedExpenses.every((e) => e.status === "draft" || e.status === "cancelled"),
  );
  const selectionLabel = $derived(
    pluralize(selectedIds.size, "Eingangsrechnung", "Eingangsrechnungen"),
  );

  function toggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function toggleSelectAll() {
    selectedIds =
      selectedIds.size === sortedExpenses.length
        ? new Set()
        : new Set(sortedExpenses.map((e) => e.id));
  }

  async function runBulkAction(successMessage: string, action: (id: number) => Promise<void>) {
    const targets = selectedExpenses;
    bulkBusy = true;
    try {
      for (const e of targets) await action(e.id);
      toast.success(`${targets.length} ${successMessage}`);
      selectedIds = new Set();
    } catch (e) {
      toast.error("Bulk-Aktion fehlgeschlagen", String(e));
    } finally {
      bulkBusy = false;
      bulkDeleteConfirmOpen = false;
      await expenses.reload();
    }
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

<div class="grid grid-cols-2 @3xl:grid-cols-4 gap-3 mb-5">
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Status</Label>
    <Select bind:value={f.status} items={statusItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Jahr</Label>
    <Select bind:value={f.year} items={yearItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Lieferant</Label>
    <Select bind:value={f.vendorId} items={vendorItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Suche</Label>
    <SearchInput bind:value={f.search} placeholder="Nummer oder Lieferant…" />
  </div>
</div>

{#if expenses.error}
  <p class="text-sm text-destructive">Fehler: {expenses.error}</p>
{:else if expenses.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if expenses.data.length === 0}
  {#if filters.isFiltered}
    <EmptyState
      variant="no-results"
      message="Keine Eingangsrechnungen für diese Filter."
      actionLabel="Filter zurücksetzen"
      onAction={filters.reset}
    />
  {:else}
    <EmptyState
      message="Noch keine Eingangsrechnungen erfasst."
      actionLabel="Neue Eingangsrechnung"
      onAction={() => push("/expenses/new")}
    />
  {/if}
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <th class="px-3 @3xl:px-4 py-3 w-10">
            <Checkbox
              checked={selectedIds.size > 0 && selectedIds.size === sortedExpenses.length}
              onCheckedChange={toggleSelectAll}
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
                checked={selectedIds.has(e.id)}
                onCheckedChange={() => toggleSelect(e.id)}
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

<BulkActionBar count={selectedIds.size} label={selectionLabel} onClear={() => (selectedIds = new Set())}>
  {#if canBulkMarkPaid}
    <Button size="sm" variant="outline" onclick={() => runBulkAction("als bezahlt markiert", markExpensePaid)} disabled={bulkBusy}>
      <CheckCircle2 class="size-3.5" />
      Als bezahlt
    </Button>
  {/if}
  {#if canBulkDelete}
    <Button size="sm" variant="destructive" onclick={() => (bulkDeleteConfirmOpen = true)} disabled={bulkBusy}>
      <Trash2 class="size-3.5" />
      Löschen
    </Button>
  {/if}
</BulkActionBar>

<ConfirmDialog
  bind:open={bulkDeleteConfirmOpen}
  title="{selectedIds.size} {selectionLabel} löschen?"
  description="Nur Entwürfe und stornierte Belege werden gelöscht. Offene/bezahlte bleiben unangetastet."
  confirmLabel="Löschen"
  destructive
  onConfirm={() => runBulkAction("gelöscht", deleteExpense)}
/>
