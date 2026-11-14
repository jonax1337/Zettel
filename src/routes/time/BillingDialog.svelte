<script lang="ts">
  import { untrack } from "svelte";
  import { push } from "svelte-spa-router";
  import type { BillingGrouping, BillingIncrement, BillingPreview } from "$lib/time/billing";
  import { billTimeEntries, previewTimeBilling } from "$lib/db/time-billing";
  import { centsToEur } from "$lib/utils/money";
  import { Button, Dialog, Label, Select, toast } from "$lib/ui";
  import { AlertTriangle } from "$lib/brand-icons";
  import {
    formatLinePeriod,
    GROUPING_ITEMS,
    INCREMENT_ITEMS,
    lineQuantityText,
    ROUNDING_NOTE,
    unpricedLineWarning,
  } from "./billing-preview";

  type Props = {
    open: boolean;
    entryIds: number[];
    customerName: string;
    /** Called after the draft exists and the entries are linked to it. */
    onBilled: () => Promise<void>;
  };
  let { open = $bindable(), entryIds, customerName, onBilled }: Props = $props();

  let grouping = $state<BillingGrouping>("perProject");
  let increment = $state("1");
  let preview = $state<BillingPreview | null>(null);
  let previewError = $state<string | null>(null);
  let creating = $state(false);
  let latestRequest = 0;

  // A reopened dialog must not show the previous selection's preview.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      grouping = "perProject";
      increment = "1";
      preview = null;
      previewError = null;
    });
  });

  $effect(() => {
    if (!open) return;
    const request = ++latestRequest;
    const options = { grouping, incrementMinutes: Number(increment) as BillingIncrement };
    previewTimeBilling(entryIds, options).then(
      (result) => {
        if (request !== latestRequest) return;
        preview = result;
        previewError = null;
      },
      (e) => {
        if (request !== latestRequest) return;
        preview = null;
        previewError = String(e);
      },
    );
  });

  const warning = $derived(preview ? unpricedLineWarning(preview.lines) : null);

  async function create() {
    creating = true;
    try {
      const invoiceId = await billTimeEntries(entryIds, { grouping, incrementMinutes: Number(increment) as BillingIncrement });
      open = false;
      toast.success("Rechnungsentwurf angelegt", "Die Zeiteinträge sind jetzt abgerechnet.");
      await onBilled();
      push(`/invoices/${invoiceId}/edit`);
    } catch (e) {
      toast.error("Rechnungsentwurf konnte nicht angelegt werden", String(e));
    } finally {
      creating = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Zeiten abrechnen"
  description="{entryIds.length} {entryIds.length === 1 ? 'Eintrag' : 'Einträge'} für {customerName} werden zu einem Rechnungsentwurf."
  class="max-w-3xl"
  dismissible={!creating}
>
  <div class="flex flex-col gap-4">
    <div class="grid grid-cols-2 gap-3">
      <div class="flex flex-col gap-1.5">
        <Label for="billing-grouping" class="text-xs text-muted-foreground">Positionen</Label>
        <Select id="billing-grouping" bind:value={grouping} items={GROUPING_ITEMS} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="billing-increment" class="text-xs text-muted-foreground">Takt</Label>
        <Select id="billing-increment" bind:value={increment} items={INCREMENT_ITEMS} />
      </div>
    </div>

    {#if previewError}
      <p class="text-sm text-destructive">{previewError}</p>
    {:else if preview}
      <div class="max-h-72 overflow-auto rounded-md border">
        <table class="w-full text-sm">
          <thead class="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th class="px-3 py-2 text-left font-medium">Beschreibung</th>
              <th class="px-3 py-2 text-left font-medium whitespace-nowrap">Zeitraum</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">Menge (Std)</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">Satz</th>
              <th class="px-3 py-2 text-right font-medium whitespace-nowrap">Betrag</th>
            </tr>
          </thead>
          <tbody>
            {#each preview.lines as line, index (index)}
              <tr class="border-t">
                <td class="px-3 py-2">{line.description}</td>
                <td class="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatLinePeriod(line.linePeriodStart, line.linePeriodEnd)}</td>
                <td class="px-3 py-2 text-right font-mono whitespace-nowrap">{lineQuantityText(line)}</td>
                <td class="px-3 py-2 text-right font-mono whitespace-nowrap">{centsToEur(line.unitPrice)}</td>
                <td class="px-3 py-2 text-right font-mono whitespace-nowrap">{centsToEur(line.lineTotal)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="border-t bg-muted/30 font-medium">
              <td class="px-3 py-2" colspan="4">Netto-Summe</td>
              <td class="px-3 py-2 text-right font-mono whitespace-nowrap">{centsToEur(preview.subtotalCent)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {#if warning}
        <p class="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle class="mt-0.5 size-3.5 shrink-0" />
          {warning}
        </p>
      {/if}
    {:else}
      <p class="text-sm text-muted-foreground">Lade Vorschau…</p>
    {/if}

    <p class="text-xs text-muted-foreground">{ROUNDING_NOTE}</p>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)} disabled={creating}>Abbrechen</Button>
    <Button onclick={create} disabled={creating || preview === null}>Rechnungsentwurf anlegen</Button>
  {/snippet}
</Dialog>
