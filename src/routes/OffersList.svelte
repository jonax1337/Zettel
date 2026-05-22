<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    expireDueOffers,
    getOfferYears,
    listOffers,
    type OfferFilter,
    type OfferListRow,
  } from "$lib/db/offers";
  import type { OfferStatus } from "$lib/db/schema";
  import { listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { Button, Card, Input, Select, Badge, Label, Checkbox, SortableTh, BulkActionBar, ConfirmDialog, toast } from "$lib/ui";
  import { Plus, Search, Send, Ban, Trash2 } from "@lucide/svelte";
  import { applySort, loadSortState, saveSortState, type SortState } from "$lib/utils/sort";
  import { deleteOffer, markSent as markOfferSent, markRejected } from "$lib/db/offers";

  let offers = $state<OfferListRow[]>([]);
  let customers = $state<Customer[]>([]);
  let years = $state<number[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let status = $state<string>("all");
  let year = $state<string>("all");
  let customerId = $state<string>("all");
  let search = $state("");

  async function reload() {
    loading = true;
    try {
      const filter: OfferFilter = {
        status: (status === "all" ? "all" : status) as OfferStatus | "all",
        year: year === "all" ? "all" : Number.parseInt(year, 10),
        customerId: customerId === "all" ? "all" : Number.parseInt(customerId, 10),
        search,
      };
      offers = await listOffers(filter);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    expireDueOffers()
      .catch(() => {})
      .finally(() => {
        listCustomers().then((c) => (customers = c));
        getOfferYears().then((y) => (years = y));
        reload();
      });
  });

  $effect(() => {
    void status;
    void year;
    void customerId;
    void search;
    reload();
  });

  const statusLabel: Record<OfferStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    accepted: "Angenommen",
    rejected: "Abgelehnt",
    expired: "Abgelaufen",
  };

  const statusVariant: Record<
    OfferStatus,
    "secondary" | "warning" | "success" | "destructive" | "outline"
  > = {
    draft: "secondary",
    sent: "warning",
    accepted: "success",
    rejected: "destructive",
    expired: "outline",
  };

  const statusItems = $derived([
    { value: "all", label: "Alle Status" },
    { value: "draft", label: "Entwurf" },
    { value: "sent", label: "Versendet" },
    { value: "accepted", label: "Angenommen" },
    { value: "rejected", label: "Abgelehnt" },
    { value: "expired", label: "Abgelaufen" },
  ]);

  const yearItems = $derived([
    { value: "all", label: "Alle Jahre" },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ]);

  const customerItems = $derived([
    { value: "all", label: "Alle Kunden" },
    ...customers.map((c) => ({ value: String(c.id), label: c.name })),
  ]);

  type SortKey = "number" | "issueDate" | "customer" | "total" | "status" | "validUntil";
  let sort = $state<SortState<SortKey>>(loadSortState<SortKey>("offers", { key: "issueDate", dir: "desc" }));
  function setSort(key: SortKey, dir: SortState<SortKey>["dir"]) {
    sort = { key: dir === null ? null : key, dir };
    saveSortState("offers", sort);
  }
  const sortedOffers = $derived(
    applySort(offers, sort, {
      number: (r) => r.number,
      issueDate: (r) => r.issueDate,
      customer: (r) => r.customerName,
      total: (r) => r.total,
      status: (r) => r.status,
      validUntil: (r) => r.validUntil,
    }),
  );

  let selectedIds = $state<Set<number>>(new Set());
  let bulkBusy = $state(false);
  let bulkDeleteConfirmOpen = $state(false);

  const selectedOffers = $derived(sortedOffers.filter((o) => selectedIds.has(o.id)));

  const canBulkMarkSent = $derived(
    selectedOffers.length > 0 && selectedOffers.every((o) => o.status === "draft"),
  );
  const canBulkReject = $derived(
    selectedOffers.length > 0 && selectedOffers.every((o) => o.status === "sent" || o.status === "draft"),
  );
  const canBulkDelete = $derived(
    selectedOffers.length > 0 &&
      selectedOffers.every((o) => o.status === "draft" || o.status === "rejected" || o.status === "expired"),
  );

  function toggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }
  function toggleSelectAll() {
    if (selectedIds.size === sortedOffers.length) selectedIds = new Set();
    else selectedIds = new Set(sortedOffers.map((o) => o.id));
  }

  async function bulkAction(label: string, fn: (id: number) => Promise<void>) {
    bulkBusy = true;
    try {
      for (const o of selectedOffers) await fn(o.id);
      toast.success(`${selectedOffers.length} ${label}`);
      selectedIds = new Set();
      await reload();
    } catch (e) {
      toast.error("Bulk-Aktion fehlgeschlagen", String(e));
    } finally {
      bulkBusy = false;
      bulkDeleteConfirmOpen = false;
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Angebote</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {offers.length} {offers.length === 1 ? "Angebot" : "Angebote"}
    </p>
  </div>
  <Button onclick={() => push("/offers/new")}>
    <Plus />
    Neues Angebot
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
    <Label class="text-xs text-muted-foreground">Kunde</Label>
    <Select bind:value={customerId} items={customerItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label class="text-xs text-muted-foreground">Suche</Label>
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input type="search" placeholder="Nummer oder Kunde…" bind:value={search} class="pl-9" />
    </div>
  </div>
</div>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if offers.length === 0}
  <Card>
    <div class="py-12 text-center text-sm text-muted-foreground">
      Keine Angebote gefunden.
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr>
          <th class="px-4 py-3 w-10">
            <Checkbox
              checked={selectedIds.size > 0 && selectedIds.size === sortedOffers.length}
              onCheckedChange={toggleSelectAll}
              aria-label="Alle auswählen"
            />
          </th>
          <SortableTh column="number" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Nummer</SortableTh>
          <SortableTh column="issueDate" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Datum</SortableTh>
          <SortableTh column="customer" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Kunde</SortableTh>
          <SortableTh column="total" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} align="right" class="px-4 py-3 text-right">Betrag</SortableTh>
          <SortableTh column="status" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Status</SortableTh>
          <SortableTh column="validUntil" activeKey={sort.key} activeDir={sort.dir} onChange={setSort} class="px-4 py-3">Gültig bis</SortableTh>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each sortedOffers as off (off.id)}
          <tr
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            onclick={() => push(`/offers/${off.id}`)}
          >
            <td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedIds.has(off.id)}
                onCheckedChange={() => toggleSelect(off.id)}
                aria-label={`Angebot ${off.number} auswählen`}
              />
            </td>
            <td class="px-4 py-3 font-mono text-xs">{off.number}</td>
            <td class="px-4 py-3 text-muted-foreground">{formatDate(off.issueDate)}</td>
            <td class="px-4 py-3">{off.customerName}</td>
            <td class="px-4 py-3 text-right font-mono">{centsToEur(off.total)}</td>
            <td class="px-4 py-3">
              <Badge variant={statusVariant[off.status]}>{statusLabel[off.status]}</Badge>
            </td>
            <td class="px-4 py-3 text-muted-foreground text-xs">{formatDate(off.validUntil)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}

<BulkActionBar count={selectedIds.size} label="Angebot{selectedIds.size === 1 ? '' : 'e'}" onClear={() => (selectedIds = new Set())}>
  {#if canBulkMarkSent}
    <Button size="sm" variant="outline" onclick={() => bulkAction('als versandt markiert', markOfferSent)} disabled={bulkBusy}>
      <Send class="size-3.5" />
      Versenden
    </Button>
  {/if}
  {#if canBulkReject}
    <Button size="sm" variant="outline" onclick={() => bulkAction('abgelehnt', markRejected)} disabled={bulkBusy}>
      <Ban class="size-3.5" />
      Ablehnen
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
  title="{selectedIds.size} Angebot{selectedIds.size === 1 ? '' : 'e'} löschen?"
  description="Nur Entwürfe, abgelehnte und abgelaufene Angebote werden gelöscht. Angenommene bleiben unangetastet."
  confirmLabel="Löschen"
  destructive
  onConfirm={() => bulkAction('gelöscht', deleteOffer)}
/>
