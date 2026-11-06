<script lang="ts">
  import { Badge, Card, CardContent } from "$lib/ui";
  import { AlertTriangle, ChevronDown, ChevronUp, ShieldCheck } from "$lib/brand-icons";
  import { listInvoiceHistory, type AuditEntry } from "$lib/db/audit";
  import { describeAuditEntry } from "./audit-description";
  import type { Invoice } from "$lib/db/schema";
  import { checkInvoiceSeal, type InvoiceSealStatus } from "$lib/db/seals";
  import { formatDate, formatDateTime } from "$lib/utils/date";

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

<Card class="mb-6">
  <CardContent class="space-y-3">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 text-left"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Änderungsverlauf</h3>
      {#if open}<ChevronUp class="size-4 text-muted-foreground" />{:else}<ChevronDown class="size-4 text-muted-foreground" />{/if}
    </button>

    {#if seal?.state === "sealed" && seal.sealedAt !== null && seal.hash}
      <div class="flex items-center gap-2 text-sm">
        <Badge variant="success"><ShieldCheck /> Versiegelt am {formatDate(seal.sealedAt)}</Badge>
        <code class="text-xs text-muted-foreground" title={seal.hash}>{seal.hash.slice(0, SHORT_HASH_LENGTH)}</code>
      </div>
    {:else if seal?.state === "changed"}
      <div class="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive">
        <AlertTriangle class="size-4 shrink-0" />
        Inhalt seit dem Versiegeln verändert
      </div>
    {:else if seal?.state === "unsealed"}
      <Badge variant="warning"><AlertTriangle /> Noch nicht versiegelt</Badge>
    {/if}

    {#if error}
      <p class="text-sm text-destructive break-words">Änderungsverlauf konnte nicht geladen werden: {error}</p>
    {/if}

    {#if open}
      {#if loading && entries.length === 0}
        <p class="text-sm text-muted-foreground">Änderungsverlauf wird geladen …</p>
      {:else if entries.length === 0 && !error}
        <p class="text-sm text-muted-foreground">Keine Änderungen protokolliert.</p>
      {:else}
        <ul class="divide-y">
          {#each entries as entry (entry.id)}
            <li class="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
              <time class="shrink-0 text-xs text-muted-foreground sm:w-40 sm:pt-0.5">{formatDateTime(entry.changedAt)}</time>
              <span class="text-sm break-words">{describeAuditEntry(entry, invoice.currency)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </CardContent>
</Card>
