<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    cancelInvoice,
    deleteInvoice,
    getInvoice,
    markPaid,
    markSent,
    reopenDraft,
  } from "$lib/db/invoices";
  import type {
    CustomerSnapshot,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
  } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { generateInvoicePdf } from "$lib/sidecar/invoice";
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let invoice = $state<Invoice | null>(null);
  let items = $state<InvoiceItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let generating = $state(false);
  let lastPdfPath = $state<string | null>(null);
  let pdfError = $state<string | null>(null);

  const customer = $derived.by(() => {
    if (!invoice) return null;
    try {
      return JSON.parse(invoice.customerSnapshot) as CustomerSnapshot;
    } catch {
      return null;
    }
  });

  async function load() {
    if (!params?.id) return;
    const numId = Number.parseInt(params.id, 10);
    if (Number.isNaN(numId)) return;
    loading = true;
    try {
      const res = await getInvoice(numId);
      if (!res) {
        error = "Rechnung nicht gefunden.";
        return;
      }
      invoice = res.invoice;
      items = res.items;
      lastPdfPath = res.invoice.pdfPath;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void params?.id;
    load();
  });

  async function action(fn: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await fn();
      await load();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  async function onDelete() {
    if (!invoice) return;
    if (!confirm(`Rechnung ${invoice.number} wirklich löschen?`)) return;
    busy = true;
    try {
      await deleteInvoice(invoice.id);
      push("/invoices");
    } catch (e) {
      error = String(e);
      busy = false;
    }
  }

  async function onGeneratePdf() {
    if (!invoice) return;
    generating = true;
    pdfError = null;
    try {
      const res = await generateInvoicePdf(invoice.id);
      if (res.success) {
        lastPdfPath = res.pdfPath;
        await openPath(res.pdfPath);
      } else {
        pdfError = `${res.error.code}: ${res.error.message}`;
      }
    } catch (e) {
      pdfError = String(e);
    } finally {
      generating = false;
    }
  }

  async function onOpenExisting() {
    if (lastPdfPath) {
      try {
        await openPath(lastPdfPath);
      } catch (e) {
        pdfError = String(e);
      }
    }
  }

  async function onRevealInExplorer() {
    if (lastPdfPath) {
      try {
        await revealItemInDir(lastPdfPath);
      } catch (e) {
        pdfError = String(e);
      }
    }
  }

  const statusLabel: Record<InvoiceStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };
</script>

<header class="mb-6">
  <a href="/invoices" use:link class="text-sm text-neutral-500 hover:underline">
    ← Rechnungen
  </a>
</header>

{#if loading}
  <p class="text-sm text-neutral-500">Lade…</p>
{:else if error && !invoice}
  <p class="text-sm text-red-600">{error}</p>
{:else if invoice && customer}
  <div class="flex items-start justify-between gap-4 mb-6">
    <div>
      <h1 class="text-2xl font-semibold">{invoice.number}</h1>
      <p class="text-sm text-neutral-500">
        {customer.name} · {formatDate(invoice.issueDate)} · Status: <strong>{statusLabel[invoice.status]}</strong>
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={generating}
        onclick={onGeneratePdf}
        class="px-3 py-1.5 rounded text-sm bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {generating ? "Erzeuge…" : lastPdfPath ? "PDF neu erzeugen" : "PDF erzeugen"}
      </button>
      {#if lastPdfPath}
        <button
          type="button"
          onclick={onOpenExisting}
          class="px-3 py-1.5 rounded text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          PDF öffnen
        </button>
        <button
          type="button"
          onclick={onRevealInExplorer}
          class="px-3 py-1.5 rounded text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Im Explorer zeigen
        </button>
      {/if}
      {#if invoice.status === "draft"}
        <a
          href={`/invoices/${invoice.id}/edit`}
          use:link
          class="px-3 py-1.5 rounded border text-sm border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Bearbeiten
        </a>
        <button
          type="button"
          disabled={busy}
          onclick={() => action(() => markSent(invoice!.id))}
          class="px-3 py-1.5 rounded text-sm bg-blue-600 text-white hover:bg-blue-700"
        >
          Als versendet markieren
        </button>
      {/if}
      {#if invoice.status === "sent"}
        <button
          type="button"
          disabled={busy}
          onclick={() => action(() => markPaid(invoice!.id))}
          class="px-3 py-1.5 rounded text-sm bg-green-600 text-white hover:bg-green-700"
        >
          Als bezahlt markieren
        </button>
        <button
          type="button"
          disabled={busy}
          onclick={() => action(() => reopenDraft(invoice!.id))}
          class="px-3 py-1.5 rounded text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Zurück zu Entwurf
        </button>
      {/if}
      {#if invoice.status !== "cancelled" && invoice.status !== "paid"}
        <button
          type="button"
          disabled={busy}
          onclick={() => action(() => cancelInvoice(invoice!.id))}
          class="px-3 py-1.5 rounded text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Stornieren
        </button>
      {/if}
      {#if invoice.status === "draft" || invoice.status === "cancelled"}
        <button
          type="button"
          disabled={busy}
          onclick={onDelete}
          class="px-3 py-1.5 rounded text-sm text-red-600 border border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
        >
          Löschen
        </button>
      {/if}
    </div>
  </div>

  {#if error}
    <p class="text-sm text-red-600 mb-4">{error}</p>
  {/if}
  {#if pdfError}
    <div class="mb-4 p-3 rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
      <strong>PDF-Generierung fehlgeschlagen:</strong>
      <div class="mt-1 font-mono text-xs">{pdfError}</div>
      <div class="mt-2 text-xs text-red-600 dark:text-red-400">
        Sidecar-Setup geprüft? Siehe sidecar/README.md (Python 3.12 + GTK + venv).
      </div>
    </div>
  {/if}
  {#if lastPdfPath && !pdfError}
    <p class="text-xs text-neutral-500 mb-4 font-mono">PDF: {lastPdfPath}</p>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
    <section class="border rounded p-4 border-neutral-200 dark:border-neutral-800">
      <h2 class="text-xs font-semibold uppercase text-neutral-500 mb-2">Kunde (Snapshot)</h2>
      <div class="text-sm">
        <div class="font-medium">{customer.name}</div>
        {#if customer.contactPerson}<div>{customer.contactPerson}</div>{/if}
        <div class="text-neutral-500">{customer.street}</div>
        <div class="text-neutral-500">{customer.postalCode} {customer.city}</div>
        <div class="text-neutral-500">{customer.country}</div>
        {#if customer.vatId}
          <div class="text-xs mt-2 text-neutral-500">USt-IdNr.: {customer.vatId}</div>
        {/if}
      </div>
    </section>

    <section class="border rounded p-4 border-neutral-200 dark:border-neutral-800">
      <h2 class="text-xs font-semibold uppercase text-neutral-500 mb-2">Eckdaten</h2>
      <dl class="text-sm grid grid-cols-2 gap-y-1">
        <dt class="text-neutral-500">Rechnungsdatum</dt>
        <dd>{formatDate(invoice.issueDate)}</dd>
        <dt class="text-neutral-500">Fällig am</dt>
        <dd>{formatDate(invoice.dueDate)}</dd>
        {#if invoice.deliveryDate}
          <dt class="text-neutral-500">Liefer-/Leistungsdatum</dt>
          <dd>{formatDate(invoice.deliveryDate)}</dd>
        {/if}
        {#if invoice.sentAt}
          <dt class="text-neutral-500">Versendet</dt>
          <dd>{formatDate(invoice.sentAt)}</dd>
        {/if}
        {#if invoice.paidAt}
          <dt class="text-neutral-500">Bezahlt</dt>
          <dd>{formatDate(invoice.paidAt)}</dd>
        {/if}
      </dl>
    </section>
  </div>

  <section class="border rounded overflow-hidden border-neutral-200 dark:border-neutral-800 mb-6">
    <table class="w-full text-sm">
      <thead class="bg-neutral-50 dark:bg-neutral-900 text-left">
        <tr>
          <th class="px-3 py-2 font-medium w-12">#</th>
          <th class="px-3 py-2 font-medium">Beschreibung</th>
          <th class="px-3 py-2 font-medium text-right w-20">Menge</th>
          <th class="px-3 py-2 font-medium w-20">Einheit</th>
          <th class="px-3 py-2 font-medium text-right w-28">Preis</th>
          {#if !invoice.isKleinunternehmer}
            <th class="px-3 py-2 font-medium text-right w-16">USt%</th>
          {/if}
          <th class="px-3 py-2 font-medium text-right w-28">Summe</th>
        </tr>
      </thead>
      <tbody>
        {#each items as it (it.id)}
          <tr class="border-t border-neutral-200 dark:border-neutral-800">
            <td class="px-3 py-2 text-xs text-neutral-500">{it.position}</td>
            <td class="px-3 py-2">{it.description}</td>
            <td class="px-3 py-2 text-right">{it.quantity}</td>
            <td class="px-3 py-2">{it.unit}</td>
            <td class="px-3 py-2 text-right font-mono">{centsToEur(it.unitPrice)}</td>
            {#if !invoice.isKleinunternehmer}
              <td class="px-3 py-2 text-right">{it.vatRate}</td>
            {/if}
            <td class="px-3 py-2 text-right font-mono">{centsToEur(it.lineTotal)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="bg-neutral-50 dark:bg-neutral-900">
        <tr class="border-t border-neutral-200 dark:border-neutral-800">
          <td colspan={invoice.isKleinunternehmer ? 5 : 6} class="px-3 py-2 text-right text-neutral-500">Zwischensumme</td>
          <td class="px-3 py-2 text-right font-mono">{centsToEur(invoice.subtotal)}</td>
        </tr>
        {#if !invoice.isKleinunternehmer}
          <tr>
            <td colspan="6" class="px-3 py-2 text-right text-neutral-500">USt</td>
            <td class="px-3 py-2 text-right font-mono">{centsToEur(invoice.vatAmount)}</td>
          </tr>
        {/if}
        <tr class="border-t border-neutral-200 dark:border-neutral-800">
          <td colspan={invoice.isKleinunternehmer ? 5 : 6} class="px-3 py-2 text-right font-semibold">Gesamtbetrag</td>
          <td class="px-3 py-2 text-right font-mono font-semibold">{centsToEur(invoice.total)}</td>
        </tr>
      </tfoot>
    </table>
  </section>

  {#if invoice.paymentTerms}
    <section class="mb-4">
      <h3 class="text-xs font-semibold uppercase text-neutral-500 mb-1">Zahlungsbedingungen</h3>
      <p class="text-sm whitespace-pre-line">{invoice.paymentTerms}</p>
    </section>
  {/if}

  {#if invoice.notes}
    <section class="mb-4">
      <h3 class="text-xs font-semibold uppercase text-neutral-500 mb-1">Notizen</h3>
      <p class="text-sm whitespace-pre-line">{invoice.notes}</p>
    </section>
  {/if}

  <div class="text-xs text-neutral-400 mt-8">
    ZUGFeRD/Factur-X-Embedding folgt in M4.
  </div>
{/if}
