<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    computeLineTotal,
    computeTotals,
    createInvoice,
    getInvoice,
    updateInvoice,
    type InvoiceFormInput,
    type InvoiceItemInput,
  } from "$lib/db/invoices";
  import type { Customer, Settings } from "$lib/db/schema";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import {
    addDaysUnix,
    fromIsoDate,
    nowUnix,
    toIsoDate,
  } from "$lib/utils/date";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);

  let customerId = $state<number | null>(null);
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let deliveryDateIso = $state("");
  let dueDateIso = $state(toIsoDate(addDaysUnix(nowUnix(), 14)));
  let notes = $state("");
  let paymentTerms = $state("");
  let items = $state<Array<InvoiceItemInput & { priceText: string }>>([
    { description: "", quantity: 1, unit: "Stk", unitPrice: 0, vatRate: 0, priceText: "" },
  ]);

  // Load settings + customers, then optionally load existing invoice.
  $effect(() => {
    Promise.all([loadSettings(), listCustomers()])
      .then(([s, cs]) => {
        settings = s;
        customers = cs;
        // Default values from settings
        if (mode === "new") {
          paymentTerms = `Zahlbar innerhalb von ${s.defaultPaymentTermsDays} Tagen ohne Abzug.`;
          for (const it of items) it.vatRate = s.isKleinunternehmer ? 0 : 19;
          items = [...items];
        }
      })
      .catch((e) => (error = String(e)));
  });

  $effect(() => {
    if (mode === "edit" && params?.id) {
      const numId = Number.parseInt(params.id, 10);
      if (Number.isNaN(numId)) return;
      id = numId;
      getInvoice(numId)
        .then((res) => {
          if (!res) {
            error = "Rechnung nicht gefunden.";
            return;
          }
          if (res.invoice.status !== "draft") {
            error = "Nur Entwürfe können bearbeitet werden.";
            return;
          }
          customerId = res.invoice.customerId;
          issueDateIso = toIsoDate(res.invoice.issueDate);
          deliveryDateIso = res.invoice.deliveryDate
            ? toIsoDate(res.invoice.deliveryDate)
            : "";
          dueDateIso = toIsoDate(res.invoice.dueDate);
          notes = res.invoice.notes ?? "";
          paymentTerms = res.invoice.paymentTerms ?? "";
          items = res.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            vatRate: it.vatRate,
            priceText: (it.unitPrice / 100).toFixed(2).replace(".", ","),
          }));
        })
        .catch((e) => (error = String(e)))
        .finally(() => (loaded = true));
    }
  });

  function addItem() {
    items = [
      ...items,
      {
        description: "",
        quantity: 1,
        unit: "Stk",
        unitPrice: 0,
        vatRate: settings?.isKleinunternehmer ? 0 : 19,
        priceText: "",
      },
    ];
  }

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }

  function onPriceBlur(idx: number) {
    const it = items[idx];
    it.unitPrice = eurStringToCents(it.priceText);
    it.priceText = (it.unitPrice / 100).toFixed(2).replace(".", ",");
    items = [...items];
  }

  const totals = $derived.by(() => {
    if (!settings) return { subtotal: 0, vatAmount: 0, total: 0 };
    return computeTotals(items, settings.isKleinunternehmer);
  });

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (customerId === null) {
      error = "Bitte einen Kunden auswählen.";
      return;
    }
    if (items.length === 0) {
      error = "Mindestens eine Position erforderlich.";
      return;
    }
    saving = true;
    error = null;
    try {
      const input: InvoiceFormInput = {
        customerId,
        issueDate: fromIsoDate(issueDateIso),
        deliveryDate: deliveryDateIso ? fromIsoDate(deliveryDateIso) : null,
        dueDate: fromIsoDate(dueDateIso),
        notes: notes.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        items: items.map(({ priceText: _p, ...rest }) => rest),
      };
      let savedId: number;
      if (mode === "new") {
        savedId = await createInvoice(input);
      } else if (id !== null) {
        await updateInvoice(id, input);
        savedId = id;
      } else {
        throw new Error("Keine ID");
      }
      push(`/invoices/${savedId}`);
    } catch (err) {
      error = String(err);
    } finally {
      saving = false;
    }
  }

  const inputClass =
    "border rounded px-2 py-1.5 border-neutral-300 dark:border-neutral-700 bg-transparent";
</script>

<header class="mb-6">
  <a href="/invoices" use:link class="text-sm text-neutral-500 hover:underline">
    ← Rechnungen
  </a>
  <h1 class="text-2xl font-semibold mt-1">
    {mode === "new" ? "Neue Rechnung" : "Rechnung bearbeiten"}
  </h1>
</header>

{#if loading}
  <p class="text-sm text-neutral-500">Lade…</p>
{:else}
  <form onsubmit={onSubmit} class="max-w-4xl space-y-6">
    <section class="grid grid-cols-2 gap-3">
      <label class="col-span-2 flex flex-col gap-1 text-sm">
        Kunde <span class="text-red-600">*</span>
        <select bind:value={customerId} class={inputClass} required>
          <option value={null}>— bitte wählen —</option>
          {#each customers as c}
            <option value={c.id}>{c.customerNumber} · {c.name}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Rechnungsdatum
        <input type="date" class={inputClass} bind:value={issueDateIso} required />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Fällig am
        <input type="date" class={inputClass} bind:value={dueDateIso} required />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Liefer-/Leistungsdatum
        <input type="date" class={inputClass} bind:value={deliveryDateIso} />
      </label>
    </section>

    <section>
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold uppercase text-neutral-500">Positionen</h2>
        <button
          type="button"
          onclick={addItem}
          class="text-sm px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          + Position
        </button>
      </div>
      <div class="border rounded overflow-hidden border-neutral-200 dark:border-neutral-800">
        <table class="w-full text-sm">
          <thead class="bg-neutral-50 dark:bg-neutral-900 text-left">
            <tr>
              <th class="px-2 py-2 w-12">#</th>
              <th class="px-2 py-2">Beschreibung</th>
              <th class="px-2 py-2 w-20">Menge</th>
              <th class="px-2 py-2 w-20">Einheit</th>
              <th class="px-2 py-2 w-28">Preis (€)</th>
              {#if !settings?.isKleinunternehmer}
                <th class="px-2 py-2 w-20">USt %</th>
              {/if}
              <th class="px-2 py-2 w-28 text-right">Summe</th>
              <th class="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {#each items as it, idx (idx)}
              <tr class="border-t border-neutral-200 dark:border-neutral-800">
                <td class="px-2 py-1 text-xs text-neutral-500">{idx + 1}</td>
                <td class="px-2 py-1">
                  <input class="{inputClass} w-full" bind:value={it.description} required />
                </td>
                <td class="px-2 py-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    class="{inputClass} w-full"
                    bind:value={it.quantity}
                  />
                </td>
                <td class="px-2 py-1">
                  <input class="{inputClass} w-full" bind:value={it.unit} />
                </td>
                <td class="px-2 py-1">
                  <input
                    class="{inputClass} w-full text-right"
                    bind:value={it.priceText}
                    onblur={() => onPriceBlur(idx)}
                    placeholder="0,00"
                  />
                </td>
                {#if !settings?.isKleinunternehmer}
                  <td class="px-2 py-1">
                    <select bind:value={it.vatRate} class="{inputClass} w-full">
                      <option value={0}>0</option>
                      <option value={7}>7</option>
                      <option value={19}>19</option>
                    </select>
                  </td>
                {/if}
                <td class="px-2 py-1 text-right font-mono text-xs">
                  {centsToEur(computeLineTotal(it))}
                </td>
                <td class="px-2 py-1 text-right">
                  <button
                    type="button"
                    onclick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    class="text-xs text-red-600 hover:underline disabled:text-neutral-400"
                    title="Position entfernen"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot class="bg-neutral-50 dark:bg-neutral-900 text-sm">
            <tr class="border-t border-neutral-200 dark:border-neutral-800">
              <td colspan={settings?.isKleinunternehmer ? 5 : 6} class="px-2 py-1.5 text-right text-neutral-500">Zwischensumme</td>
              <td class="px-2 py-1.5 text-right font-mono">{centsToEur(totals.subtotal)}</td>
              <td></td>
            </tr>
            {#if !settings?.isKleinunternehmer}
              <tr>
                <td colspan="6" class="px-2 py-1.5 text-right text-neutral-500">USt</td>
                <td class="px-2 py-1.5 text-right font-mono">{centsToEur(totals.vatAmount)}</td>
                <td></td>
              </tr>
            {/if}
            <tr class="border-t border-neutral-200 dark:border-neutral-800">
              <td colspan={settings?.isKleinunternehmer ? 5 : 6} class="px-2 py-1.5 text-right font-semibold">Gesamtbetrag</td>
              <td class="px-2 py-1.5 text-right font-mono font-semibold">{centsToEur(totals.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-3">
      <label class="flex flex-col gap-1 text-sm">
        Zahlungsbedingungen
        <textarea rows="2" class={inputClass} bind:value={paymentTerms}></textarea>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Notizen / Fußtext
        <textarea rows="3" class={inputClass} bind:value={notes}></textarea>
      </label>
    </section>

    <div class="flex items-center gap-3">
      <button
        type="submit"
        disabled={saving}
        class="px-4 py-2 rounded bg-neutral-900 text-white text-sm hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </button>
      <a href="/invoices" use:link class="text-sm text-neutral-500 hover:underline">Abbrechen</a>
      {#if error}
        <span class="text-sm text-red-600">{error}</span>
      {/if}
    </div>
  </form>
{/if}
