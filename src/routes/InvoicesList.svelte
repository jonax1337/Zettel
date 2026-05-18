<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    displayInvoiceNumber,
    getInvoiceYears,
    listInvoices,
    type InvoiceFilter,
    type InvoiceListRow,
  } from "$lib/db/invoices";
  import type { InvoiceStatus } from "$lib/db/schema";
  import { listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import { Button, Card, Input, Select, Badge, Label, Checkbox } from "$lib/ui";
  import { Plus, Search } from "@lucide/svelte";

  let invoices = $state<InvoiceListRow[]>([]);
  let customers = $state<Customer[]>([]);
  let years = $state<number[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let status = $state<string>("all");
  let year = $state<string>("all");
  let customerId = $state<string>("all");
  let search = $state("");
  let onlyCreditNotes = $state(false);

  async function reload() {
    loading = true;
    try {
      const filter: InvoiceFilter = {
        status: (status === "all" ? "all" : status) as InvoiceStatus | "all",
        year: year === "all" ? "all" : Number.parseInt(year, 10),
        customerId: customerId === "all" ? "all" : Number.parseInt(customerId, 10),
        search,
      };
      const all = await listInvoices(filter);
      invoices = onlyCreditNotes ? all.filter((i) => i.isCreditNote) : all;
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    listCustomers().then((c) => (customers = c));
    getInvoiceYears().then((y) => (years = y));
  });

  $effect(() => {
    void status;
    void year;
    void customerId;
    void search;
    void onlyCreditNotes;
    reload();
  });

  function newInvoice() {
    push("/invoices/new");
  }

  const statusLabel: Record<InvoiceStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };

  const statusVariant: Record<InvoiceStatus, "secondary" | "warning" | "success" | "outline"> = {
    draft: "secondary",
    sent: "warning",
    paid: "success",
    cancelled: "outline",
  };

  const statusItems = $derived([
    { value: "all", label: "Alle Status" },
    { value: "draft", label: "Entwurf" },
    { value: "sent", label: "Versendet" },
    { value: "paid", label: "Bezahlt" },
    { value: "cancelled", label: "Storniert" },
  ]);

  const yearItems = $derived([
    { value: "all", label: "Alle Jahre" },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ]);

  const customerItems = $derived([
    { value: "all", label: "Alle Kunden" },
    ...customers.map((c) => ({ value: String(c.id), label: c.name })),
  ]);
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Rechnungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {invoices.length} {invoices.length === 1 ? "Rechnung" : "Rechnungen"}
    </p>
  </div>
  <Button onclick={newInvoice}>
    <Plus />
    Neue Rechnung
  </Button>
</header>

<div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
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

<label class="inline-flex items-center gap-2 mb-5 text-sm text-muted-foreground cursor-pointer select-none">
  <Checkbox bind:checked={onlyCreditNotes} />
  Nur Stornorechnungen
</label>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if invoices.length === 0}
  <Card>
    <div class="py-12 text-center text-sm text-muted-foreground">
      Keine Rechnungen gefunden.
    </div>
  </Card>
{:else}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium">Nummer</th>
          <th class="px-4 py-3 font-medium">Datum</th>
          <th class="px-4 py-3 font-medium">Kunde</th>
          <th class="px-4 py-3 font-medium text-right">Betrag</th>
          <th class="px-4 py-3 font-medium">Status</th>
          <th class="px-4 py-3 font-medium">Fällig</th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each invoices as inv (inv.id)}
          <tr
            class="border-t hover:bg-muted/30 cursor-pointer transition-colors"
            onclick={() => push(`/invoices/${inv.id}`)}
          >
            <td class="px-4 py-3 font-mono text-xs">
              <span class="inline-flex items-center gap-1.5">
                {displayInvoiceNumber(inv)}
                {#if inv.isCreditNote}
                  <Badge variant="destructive" class="text-[10px] px-1.5 py-0">Storno</Badge>
                {/if}
              </span>
            </td>
            <td class="px-4 py-3 text-muted-foreground">{formatDate(inv.issueDate)}</td>
            <td class="px-4 py-3">{inv.customerName}</td>
            <td class="px-4 py-3 text-right font-mono">
              <span class="inline-flex items-center gap-1.5">
                {formatMoney(inv.total, inv.currency)}
                {#if inv.currency && inv.currency !== "EUR"}
                  <Badge variant="outline" class="text-[10px] px-1.5 py-0">{inv.currency}</Badge>
                {/if}
              </span>
            </td>
            <td class="px-4 py-3">
              <Badge variant={statusVariant[inv.status]}>{statusLabel[inv.status]}</Badge>
            </td>
            <td class="px-4 py-3 text-muted-foreground text-xs">
              {inv.isCreditNote ? "—" : formatDate(inv.dueDate)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>
{/if}
