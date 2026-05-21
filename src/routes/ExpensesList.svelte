<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    getExpenseYears,
    listExpenses,
    type ExpenseFilter,
    type ExpenseListRow,
  } from "$lib/db/expenses";
  import type { ExpenseStatus, Vendor } from "$lib/db/schema";
  import { listVendors } from "$lib/db/queries";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { Button, Card, Input, Select, Badge, Label, SortableTh } from "$lib/ui";
  import { Plus, Search } from "@lucide/svelte";
  import { applySort, loadSortState, saveSortState, type SortState } from "$lib/utils/sort";

  let expenses = $state<ExpenseListRow[]>([]);
  let vendors = $state<Vendor[]>([]);
  let years = $state<number[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let status = $state<string>("all");
  let year = $state<string>("all");
  let vendorId = $state<string>("all");
  let search = $state("");

  async function reload() {
    loading = true;
    try {
      const filter: ExpenseFilter = {
        status: (status === "all" ? "all" : status) as ExpenseStatus | "all",
        year: year === "all" ? "all" : Number.parseInt(year, 10),
        vendorId: vendorId === "all" ? "all" : Number.parseInt(vendorId, 10),
        search,
      };
      expenses = await listExpenses(filter);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    listVendors().then((v) => (vendors = v));
    getExpenseYears().then((y) => (years = y));
  });

  $effect(() => {
    void status;
    void year;
    void vendorId;
    void search;
    reload();
  });

  function newExpense() {
    push("/expenses/new");
  }

  const statusLabel: Record<ExpenseStatus, string> = {
    draft: "Entwurf",
    open: "Offen",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };

  const statusVariant: Record<ExpenseStatus, "secondary" | "warning" | "success" | "outline"> = {
    draft: "secondary",
    open: "warning",
    paid: "success",
    cancelled: "outline",
  };

  const statusItems = $derived([
    { value: "all", label: "Alle Status" },
    { value: "open", label: "Offen" },
    { value: "paid", label: "Bezahlt" },
    { value: "draft", label: "Entwurf" },
    { value: "cancelled", label: "Storniert" },
  ]);

  const yearItems = $derived([
    { value: "all", label: "Alle Jahre" },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ]);

  const vendorItems = $derived([
    { value: "all", label: "Alle Lieferanten" },
    ...vendors.map((v) => ({ value: String(v.id), label: v.name })),
  ]);

  type SortKey = "internalNumber" | "number" | "issueDate" | "vendor" | "total" | "status" | "dueDate";
  let sort = $state<SortState<SortKey>>(loadSortState<SortKey>("expenses", { key: "issueDate", dir: "desc" }));
  function setSort(key: SortKey, dir: SortState<SortKey>["dir"]) {
    sort = { key: dir === null ? null : key, dir };
    saveSortState("expenses", sort);
  }
  const sortedExpenses = $derived(
    applySort(expenses, sort, {
      internalNumber: (r) => r.internalNumber,
      number: (r) => r.number,
      issueDate: (r) => r.issueDate,
      vendor: (r) => r.vendorName,
      total: (r) => r.total,
      status: (r) => r.status,
      dueDate: (r) => r.dueDate,
    }),
  );
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Eingangsrechnungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {expenses.length} {expenses.length === 1 ? "Beleg" : "Belege"}
    </p>
  </div>
  <Button onclick={newExpense}>
    <Plus />
    Neue Eingangsrechnung
  </Button>
</header>

<div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Status</Label>
    <Select bind:value={status} items={statusItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Jahr</Label>
    <Select bind:value={year} items={yearItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Lieferant</Label>
    <Select bind:value={vendorId} items={vendorItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Suche</Label>
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input type="search" placeholder="Nummer oder Lieferant…" bind:value={search} class="pl-9" />
    </div>
  </div>
</div>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if expenses.length === 0}
  <Card>
    <div class="py-12 text-center text-sm text-muted-foreground">
      Keine Eingangsrechnungen gefunden.
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <SortableTh column="internalNumber" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Interne Nr.</SortableTh>
          <SortableTh column="number" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Beleg-Nr.</SortableTh>
          <SortableTh column="issueDate" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Datum</SortableTh>
          <SortableTh column="vendor" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Lieferant</SortableTh>
          <SortableTh column="total" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} align="right" class="px-4 py-3 text-right">Brutto</SortableTh>
          <SortableTh column="status" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Status</SortableTh>
          <SortableTh column="dueDate" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Fällig</SortableTh>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each sortedExpenses as e (e.id)}
          <tr
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            onclick={() => push(`/expenses/${e.id}`)}
          >
            <td class="px-4 py-3 font-mono text-xs">{e.internalNumber}</td>
            <td class="px-4 py-3 font-mono text-xs text-muted-foreground">{e.number ?? "—"}</td>
            <td class="px-4 py-3 text-muted-foreground">{formatDate(e.issueDate)}</td>
            <td class="px-4 py-3">{e.vendorName}</td>
            <td class="px-4 py-3 text-right font-mono">{centsToEur(e.total)}</td>
            <td class="px-4 py-3">
              <Badge variant={statusVariant[e.status]}>{statusLabel[e.status]}</Badge>
            </td>
            <td class="px-4 py-3 text-muted-foreground text-xs">
              {e.dueDate ? formatDate(e.dueDate) : "—"}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}
