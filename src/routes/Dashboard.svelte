<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { listCustomers } from "$lib/db/queries";
  import {
    dashboardStats,
    recentInvoices,
    type InvoiceListRow,
  } from "$lib/db/invoices";
  import type { InvoiceStatus } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";

  let customerCount = $state(0);
  let stats = $state({
    openCount: 0,
    openTotal: 0,
    paidYtdTotal: 0,
    overdueCount: 0,
    overdueTotal: 0,
  });
  let recent = $state<InvoiceListRow[]>([]);
  let loading = $state(true);

  $effect(() => {
    Promise.all([listCustomers(), dashboardStats(), recentInvoices(10)])
      .then(([cs, s, r]) => {
        customerCount = cs.length;
        stats = s;
        recent = r;
      })
      .finally(() => (loading = false));
  });

  const statusLabel: Record<InvoiceStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };
</script>

<header class="mb-6">
  <h1 class="text-2xl font-semibold">Dashboard</h1>
  <p class="text-sm text-neutral-500">Übersicht & Schnellzugriff</p>
</header>

<div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
  <div class="border rounded p-4 border-neutral-200 dark:border-neutral-800">
    <div class="text-xs text-neutral-500 uppercase">Kunden</div>
    <div class="text-2xl font-semibold mt-1">{loading ? "…" : customerCount}</div>
  </div>
  <div class="border rounded p-4 border-neutral-200 dark:border-neutral-800">
    <div class="text-xs text-neutral-500 uppercase">Offen</div>
    <div class="text-2xl font-semibold mt-1">{loading ? "…" : centsToEur(stats.openTotal)}</div>
    <div class="text-xs text-neutral-400 mt-1">{stats.openCount} Rechnung{stats.openCount === 1 ? "" : "en"}</div>
  </div>
  <div class="border rounded p-4 border-neutral-200 dark:border-neutral-800">
    <div class="text-xs text-neutral-500 uppercase">Bezahlt {new Date().getFullYear()}</div>
    <div class="text-2xl font-semibold mt-1">{loading ? "…" : centsToEur(stats.paidYtdTotal)}</div>
  </div>
  <div class="border rounded p-4 border-neutral-200 dark:border-neutral-800">
    <div class="text-xs text-neutral-500 uppercase">Überfällig</div>
    <div class="text-2xl font-semibold mt-1" class:text-red-600={stats.overdueCount > 0}>
      {loading ? "…" : centsToEur(stats.overdueTotal)}
    </div>
    <div class="text-xs text-neutral-400 mt-1">{stats.overdueCount} Rechnung{stats.overdueCount === 1 ? "" : "en"}</div>
  </div>
</div>

<div class="flex gap-3 mb-8">
  <a
    href="/invoices/new"
    use:link
    class="px-4 py-2 rounded bg-neutral-900 text-white text-sm hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
  >
    Neue Rechnung
  </a>
  <a
    href="/customers/new"
    use:link
    class="px-4 py-2 rounded border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
  >
    Neuer Kunde
  </a>
</div>

<section>
  <h2 class="text-sm font-semibold uppercase text-neutral-500 mb-2">Letzte Rechnungen</h2>
  {#if loading}
    <p class="text-sm text-neutral-500">Lade…</p>
  {:else if recent.length === 0}
    <div class="border rounded p-6 text-center border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500">
      Noch keine Rechnungen.
    </div>
  {:else}
    <div class="border rounded overflow-hidden border-neutral-200 dark:border-neutral-800">
      <table class="w-full text-sm">
        <tbody>
          {#each recent as inv (inv.id)}
            <tr
              class="border-t border-neutral-200 dark:border-neutral-800 first:border-t-0 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer"
              onclick={() => push(`/invoices/${inv.id}`)}
            >
              <td class="px-3 py-2 font-mono text-xs">{inv.number}</td>
              <td class="px-3 py-2 text-neutral-500">{formatDate(inv.issueDate)}</td>
              <td class="px-3 py-2">{inv.customerName}</td>
              <td class="px-3 py-2 text-xs text-neutral-500">{statusLabel[inv.status]}</td>
              <td class="px-3 py-2 text-right font-mono">{centsToEur(inv.total)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
