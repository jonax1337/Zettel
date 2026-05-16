<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    getInvoiceYears,
    listInvoices,
    type InvoiceFilter,
    type InvoiceListRow,
  } from "$lib/db/invoices";
  import type { InvoiceStatus } from "$lib/db/schema";
  import { listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";

  let invoices = $state<InvoiceListRow[]>([]);
  let customers = $state<Customer[]>([]);
  let years = $state<number[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let status = $state<InvoiceStatus | "all">("all");
  let year = $state<number | "all">("all");
  let customerId = $state<number | "all">("all");
  let search = $state("");

  async function reload() {
    loading = true;
    try {
      const filter: InvoiceFilter = { status, year, customerId, search };
      invoices = await listInvoices(filter);
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
    reload();
  });

  const statusLabel: Record<InvoiceStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };

  const statusClass: Record<InvoiceStatus, string> = {
    draft: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
    sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    cancelled: "bg-neutral-100 text-neutral-500 line-through",
  };
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-2xl font-semibold">Rechnungen</h1>
    <p class="text-sm text-neutral-500">
      {invoices.length} {invoices.length === 1 ? "Rechnung" : "Rechnungen"}
    </p>
  </div>
  <a
    href="/invoices/new"
    use:link
    class="px-4 py-2 rounded bg-neutral-900 text-white text-sm hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
  >
    Neue Rechnung
  </a>
</header>

<div class="flex flex-wrap items-end gap-3 mb-4">
  <label class="flex flex-col gap-1 text-xs">
    <span class="text-neutral-500">Status</span>
    <select bind:value={status} class="border rounded px-2 py-1.5 text-sm border-neutral-300 dark:border-neutral-700 bg-transparent">
      <option value="all">Alle</option>
      <option value="draft">Entwurf</option>
      <option value="sent">Versendet</option>
      <option value="paid">Bezahlt</option>
      <option value="cancelled">Storniert</option>
    </select>
  </label>
  <label class="flex flex-col gap-1 text-xs">
    <span class="text-neutral-500">Jahr</span>
    <select bind:value={year} class="border rounded px-2 py-1.5 text-sm border-neutral-300 dark:border-neutral-700 bg-transparent">
      <option value="all">Alle</option>
      {#each years as y}
        <option value={y}>{y}</option>
      {/each}
    </select>
  </label>
  <label class="flex flex-col gap-1 text-xs">
    <span class="text-neutral-500">Kunde</span>
    <select bind:value={customerId} class="border rounded px-2 py-1.5 text-sm border-neutral-300 dark:border-neutral-700 bg-transparent">
      <option value="all">Alle</option>
      {#each customers as c}
        <option value={c.id}>{c.name}</option>
      {/each}
    </select>
  </label>
  <label class="flex flex-col gap-1 text-xs flex-1 min-w-[200px]">
    <span class="text-neutral-500">Suche</span>
    <input
      type="search"
      placeholder="Nummer oder Kunde…"
      bind:value={search}
      class="border rounded px-2 py-1.5 text-sm border-neutral-300 dark:border-neutral-700 bg-transparent"
    />
  </label>
</div>

{#if error}
  <p class="text-sm text-red-600">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-neutral-500">Lade…</p>
{:else if invoices.length === 0}
  <div class="border rounded p-8 text-center border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500">
    Keine Rechnungen gefunden.
  </div>
{:else}
  <div class="border rounded overflow-hidden border-neutral-200 dark:border-neutral-800">
    <table class="w-full text-sm">
      <thead class="bg-neutral-50 dark:bg-neutral-900 text-left">
        <tr>
          <th class="px-3 py-2 font-medium">Nummer</th>
          <th class="px-3 py-2 font-medium">Datum</th>
          <th class="px-3 py-2 font-medium">Kunde</th>
          <th class="px-3 py-2 font-medium text-right">Betrag</th>
          <th class="px-3 py-2 font-medium">Status</th>
          <th class="px-3 py-2 font-medium">Fällig</th>
        </tr>
      </thead>
      <tbody>
        {#each invoices as inv (inv.id)}
          <tr class="border-t border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900">
            <td class="px-3 py-2 font-mono text-xs">
              <button
                type="button"
                class="hover:underline"
                onclick={() => push(`/invoices/${inv.id}`)}
              >
                {inv.number}
              </button>
            </td>
            <td class="px-3 py-2 text-neutral-500">{formatDate(inv.issueDate)}</td>
            <td class="px-3 py-2">{inv.customerName}</td>
            <td class="px-3 py-2 text-right font-mono">{centsToEur(inv.total)}</td>
            <td class="px-3 py-2">
              <span class="inline-block px-2 py-0.5 rounded text-xs {statusClass[inv.status]}">
                {statusLabel[inv.status]}
              </span>
            </td>
            <td class="px-3 py-2 text-neutral-500 text-xs">{formatDate(inv.dueDate)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
