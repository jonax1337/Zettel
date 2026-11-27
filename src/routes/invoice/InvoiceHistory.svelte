<script lang="ts">
  import { Badge } from "$lib/ui";
  import { AlertTriangle, ShieldCheck } from "$lib/brand-icons";
  import { listInvoiceHistory, type AuditEntry } from "$lib/db/audit";
  import { describeAuditEntry } from "./audit-description";
  import type { Invoice } from "$lib/db/schema";
  import { checkInvoiceSeal, type InvoiceSealStatus } from "$lib/db/seals";
  import { formatDate, formatDateTime } from "$lib/utils/date";
  import DetailPanel from "./detail/DetailPanel.svelte";

  type Props = { invoice: Invoice };
  let { invoice }: Props = $props();

  const SHORT_HASH_LENGTH = 12;

  let open = $state(false);
  let entries = $state<AuditEntry[]>([]);
  let seal = $state<InvoiceSealStatus | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let loadToken = 0;

  // `invoice` is replaced on every reload of the page, which re-runs this.
  $effect(() => {
    const invoiceId = invoice.id;
    const shouldLoadEntries = open;
    const token = ++loadToken;
    void invoice;
    loading = shouldLoadEntries;
    Promise.all([checkInvoiceSeal(invoiceId), shouldLoadEntries ? listInvoiceHistory(invoiceId) : null])
      .then(([status, history]) => {
        if (token !== loadToken) return;
        seal = status;
        if (history) entries = history;
        error = null;
      })
      .catch((e) => {
        if (token === loadToken) error = String(e);
      })
      .finally(() => {
        if (token === loadToken) loading = false;
      });
  });
</script>

<DetailPanel title="Verlauf">
  {#snippet aside()}
    <button
      type="button"
      class="cursor-pointer font-semibold transition-colors hover:text-foreground"
      aria-expanded={open}
      aria-label={open ? "Änderungsverlauf ausblenden" : "Änderungsverlauf anzeigen"}
      onclick={() => (open = !open)}
    >
      {open ? "Weniger" : "Alles zeigen"}
    </button>
  {/snippet}

  {#if seal?.state === "sealed" && seal.sealedAt !== null && seal.hash}
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant="paid"><ShieldCheck /> Versiegelt am {formatDate(seal.sealedAt)}</Badge>
      <code class="text-xs text-muted-foreground" title={seal.hash}>{seal.hash.slice(0, SHORT_HASH_LENGTH)}</code>
    </div>
  {:else if seal?.state === "changed"}
    <div class="flex items-center gap-2 rounded-md bg-status-bad-bg px-3 py-2 text-sm font-bold text-status-bad">
      <AlertTriangle class="size-4 shrink-0" />
      Inhalt seit dem Versiegeln verändert
    </div>
  {:else if seal?.state === "unsealed"}
    <Badge variant="open"><AlertTriangle /> Noch nicht versiegelt</Badge>
  {/if}

  {#if error}
    <p class="text-sm break-words text-destructive">Änderungsverlauf konnte nicht geladen werden: {error}</p>
  {/if}

  {#if open}
    {#if loading && entries.length === 0}
      <p class="text-sm text-muted-foreground">Änderungsverlauf wird geladen …</p>
    {:else if entries.length === 0 && !error}
      <p class="text-sm text-muted-foreground">Keine Änderungen protokolliert.</p>
    {:else}
      <ul class="grid gap-2.5 text-[13px]">
        {#each entries as entry (entry.id)}
          <li class="grid grid-cols-[84px_1fr] gap-2">
            <time class="text-muted-foreground">{formatDateTime(entry.changedAt)}</time>
            <span class="break-words">{describeAuditEntry(entry, invoice.currency)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</DetailPanel>
