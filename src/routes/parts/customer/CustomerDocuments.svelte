<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { Badge, EmptyState, Segmented, StatusBadge } from "$lib/ui";
  import { INVOICE_STATUS } from "../../invoice/status";
  import { OFFER_STATUS } from "../../offer/status";
  import { overdueLabel } from "../../invoice/list-support";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate } from "$lib/utils/date";
  import {
    DOCUMENT_FILTER_ITEMS,
    filterDocuments,
    kindLabel,
    type CustomerDocument,
    type DocumentFilter,
  } from "./customer-documents";

  type Props = {
    documents: CustomerDocument[];
    onCreateInvoice: () => void;
  };
  let { documents, onCreateInvoice }: Props = $props();

  // Segmented binds a plain string; the items only ever offer DocumentFilter values.
  let filter = $state("all");
  const visible = $derived(filterDocuments(documents, filter as DocumentFilter));
  const emptyFilterMessage = $derived(
    filter === "offers" ? "Keine Angebote für diesen Kunden." : "Keine Rechnungen für diesen Kunden.",
  );
</script>

<section aria-labelledby="customer-documents-title">
  <div class="mb-2.5 flex items-center gap-2.5">
    <h2 id="customer-documents-title">Belege</h2>
    {#if documents.length > 0}
      <div class="ml-auto">
        <Segmented bind:value={filter} items={DOCUMENT_FILTER_ITEMS} ariaLabel="Belege filtern" />
      </div>
    {/if}
  </div>

  {#if documents.length === 0}
    <EmptyState
      message="Mit diesem Kunden gibt es noch keine Belege."
      actionLabel="Erste Rechnung erstellen"
      onAction={onCreateInvoice}
      actionVariant="outline"
    />
  {:else if visible.length === 0}
    <EmptyState variant="no-results" message={emptyFilterMessage} />
  {:else}
    <table class="data-list">
      <thead>
        <tr>
          <th>Nummer</th>
          <th class="w-full">Art</th>
          <th>Datum</th>
          <th>Status</th>
          <th class="text-right">Betrag</th>
        </tr>
      </thead>
      <tbody>
        {#each visible as document (document.key)}
          <tr class="cursor-pointer" onclick={() => push(document.href)}>
            <td class="font-semibold whitespace-nowrap tabular-nums">
              <a
                href={document.href}
                use:link
                onclick={(e) => e.stopPropagation()}
                class="hover:underline focus-visible:underline"
              >
                {document.number}
              </a>
            </td>
            <td class="w-full text-muted-foreground">{kindLabel(document)}</td>
            <td class="text-muted-foreground whitespace-nowrap tabular-nums">{formatDate(document.date)}</td>
            <td class="whitespace-nowrap">
              {#if document.kind === "offer"}
                <StatusBadge status={document.status} table={OFFER_STATUS} />
              {:else if document.daysOverdue !== null}
                <span class="inline-flex items-center gap-2">
                  <Badge variant="late">{overdueLabel(document.daysOverdue)}</Badge>
                  {#if document.status === "partial"}
                    <span class="text-xs text-muted-foreground">teilbezahlt</span>
                  {/if}
                </span>
              {:else}
                <StatusBadge status={document.status} table={INVOICE_STATUS} />
              {/if}
            </td>
            <td class="text-right font-semibold whitespace-nowrap tabular-nums">
              <span class="inline-flex items-center gap-1.5">
                {#if document.currency !== "EUR"}
                  <span class="text-xs font-normal text-muted-foreground">{document.currency}</span>
                {/if}
                {formatMoney(document.total, document.currency)}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>
