<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { deleteCustomer, listCustomers } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";

  let search = $state("");
  let customers = $state<Customer[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function reload() {
    loading = true;
    try {
      customers = await listCustomers(search);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void search;
    reload();
  });

  async function onDelete(c: Customer) {
    if (!confirm(`Kunde "${c.name}" wirklich löschen?`)) return;
    try {
      await deleteCustomer(c.id);
      await reload();
    } catch (e) {
      alert(`Fehler beim Löschen: ${e}`);
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-2xl font-semibold">Kunden</h1>
    <p class="text-sm text-neutral-500">
      {customers.length} {customers.length === 1 ? "Eintrag" : "Einträge"}
    </p>
  </div>
  <a
    href="/customers/new"
    use:link
    class="px-4 py-2 rounded bg-neutral-900 text-white text-sm hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
  >
    Neuer Kunde
  </a>
</header>

<div class="mb-4">
  <input
    type="search"
    placeholder="Suche (Name, Nummer, Ort, E-Mail)…"
    bind:value={search}
    class="w-full max-w-md border rounded px-3 py-2 text-sm border-neutral-300 dark:border-neutral-700 bg-transparent"
  />
</div>

{#if error}
  <p class="text-sm text-red-600">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-neutral-500">Lade…</p>
{:else if customers.length === 0}
  <div class="border rounded p-8 text-center border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500">
    {search ? "Keine Treffer." : "Noch keine Kunden angelegt."}
  </div>
{:else}
  <div class="border rounded overflow-hidden border-neutral-200 dark:border-neutral-800">
    <table class="w-full text-sm">
      <thead class="bg-neutral-50 dark:bg-neutral-900 text-left">
        <tr>
          <th class="px-3 py-2 font-medium">Nr.</th>
          <th class="px-3 py-2 font-medium">Name</th>
          <th class="px-3 py-2 font-medium">Ort</th>
          <th class="px-3 py-2 font-medium">E-Mail</th>
          <th class="px-3 py-2 font-medium w-32"></th>
        </tr>
      </thead>
      <tbody>
        {#each customers as c (c.id)}
          <tr class="border-t border-neutral-200 dark:border-neutral-800">
            <td class="px-3 py-2 font-mono text-xs">{c.customerNumber}</td>
            <td class="px-3 py-2">
              <button
                type="button"
                class="hover:underline text-left"
                onclick={() => push(`/customers/${c.id}`)}
              >
                {c.name}
              </button>
            </td>
            <td class="px-3 py-2 text-neutral-500">{c.city}</td>
            <td class="px-3 py-2 text-neutral-500">{c.email ?? ""}</td>
            <td class="px-3 py-2 text-right">
              <button
                type="button"
                class="text-xs text-red-600 hover:underline"
                onclick={() => onDelete(c)}
              >
                Löschen
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
