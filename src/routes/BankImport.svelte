<script lang="ts">
  import { link } from "svelte-spa-router";
  import { parseBankStatement } from "$lib/sidecar/bank";
  import { matchBookings, type MatchCandidate } from "$lib/bank/match";
  import { openBalanceCent } from "$lib/db/invoice-lifecycle";
  import { listInvoices, type InvoiceListRow } from "$lib/db/invoices";
  import { nowUnix } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
  import { formatMoney } from "$lib/utils/currency";
  import { Badge, Button, Checkbox, PageHeader, Select, toast } from "$lib/ui";
  import type { BadgeVariant } from "$lib/ui/Badge.svelte";
  import { Check, CheckCircle2 } from "$lib/brand-icons";
  import { pluralize } from "./parts/entity/format";
  import {
    canApply,
    paymentFor,
    pickedMatch,
    toImportRows,
    type ImportRow,
    type StatementFormat,
  } from "./parts/bank/import-rows";
  import {
    assignManualInvoice,
    candidateLabel,
    formatBookingDate,
    invoicePickerLabel,
    payableInvoices,
    recordBooking,
    summarizeOutcomes,
    type ApplyOutcome,
  } from "./parts/bank/import-view";
  import StatementDropZone from "./parts/bank/StatementDropZone.svelte";
  import { fileNameOf, remainderNote, statementSummary } from "./parts/bank/statement-summary";

  const CONFIDENCE_TONE: Record<MatchCandidate["confidence"], BadgeVariant> = {
    high: "paid",
    medium: "open",
    low: "draft",
  };
  const OUTCOME_BADGE: Record<ApplyOutcome["kind"], { label: string; variant: BadgeVariant }> = {
    applied: { label: "Gebucht", variant: "paid" },
    duplicate: { label: "Duplikat", variant: "calm" },
    failed: { label: "Fehlgeschlagen", variant: "late" },
  };
  const FORMAT_LABEL: Record<StatementFormat, string> = { camt: "CAMT.053", mt940: "MT940" };

  let parsing = $state(false);
  let applying = $state(false);
  let error = $state<string | null>(null);

  let detectedFormat = $state<StatementFormat | null>(null);
  let statementFile = $state("");
  let statementLine = $state("");
  let rows = $state<ImportRow[]>([]);
  let invoices = $state<InvoiceListRow[]>([]);
  let outcomes = $state<ApplyOutcome[] | null>(null);

  // A ticked row without a chosen invoice records nothing, so it must not count.
  const willApplyCount = $derived(rows.filter((r) => r.included && pickedMatch(r)).length);
  // After a partial failure only the failed bookings are left, so the line must not keep the old count.
  const summaryLine = $derived(
    outcomes
      ? `noch ${statementSummary(rows.map((r) => r.match.booking))} zum erneuten Versuch`
      : statementLine,
  );
  const loaded = $derived(
    detectedFormat && rows.length > 0
      ? { fileName: statementFile, format: FORMAT_LABEL[detectedFormat], summary: summaryLine }
      : null,
  );
  const busy = $derived(
    parsing ? "Kontoauszug wird gelesen…" : applying ? "Zuordnungen werden übernommen…" : null,
  );

  async function loadStatement(path: string) {
    if (parsing || applying) return;
    parsing = true;
    error = null;
    rows = [];
    outcomes = null;
    detectedFormat = null;
    try {
      const result = await parseBankStatement(path, "auto");
      if (!result.success) {
        error = `${result.error.code}: ${result.error.message}`;
        toast.error("Datei konnte nicht geparst werden", result.error.message);
        return;
      }
      detectedFormat = result.format;
      statementFile = fileNameOf(path);
      statementLine = statementSummary(result.bookings);
      invoices = await listInvoices({});
      const matches = matchBookings(result.bookings, invoices);
      rows = toImportRows(matches);
      toast.success(
        `${matches.length} ${pluralize(matches.length, "Buchung", "Buchungen")} eingelesen`,
        `${matches.filter((m) => m.candidates.length > 0).length} mit Vorschlag`,
      );
    } catch (e) {
      error = String(e);
      toast.error("Parse fehlgeschlagen", String(e));
    } finally {
      parsing = false;
    }
  }

  function pickerItems(row: ImportRow) {
    return payableInvoices(invoices, row.match.booking.currency).map((invoice) => ({
      value: String(invoice.id),
      label: invoicePickerLabel(invoice),
    }));
  }

  function assignInvoice(row: ImportRow, invoiceId: string) {
    const invoice = invoices.find((i) => String(i.id) === invoiceId);
    if (invoice) assignManualInvoice(row, invoice);
  }

  async function applyRow(row: ImportRow, format: StatementFormat): Promise<ApplyOutcome | null> {
    const payment = paymentFor(row, format, nowUnix());
    const invoice = pickedMatch(row)?.invoice;
    if (!payment || !invoice) return null;
    return recordBooking(payment, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amountCent: payment.amountCent,
      currency: invoice.currency,
    });
  }

  /** Records every ticked booking; rows that fail stay in the list so they can be retried. */
  async function applyAll(format: StatementFormat) {
    if (applying) return;
    applying = true;
    try {
      const failedRows: ImportRow[] = [];
      const results: ApplyOutcome[] = [];
      for (const row of rows) {
        const result = await applyRow(row, format);
        if (!result) continue;
        results.push(result);
        if (result.kind === "failed") failedRows.push(row);
      }
      outcomes = results;
      rows = failedRows;
      if (failedRows.length === 0) detectedFormat = null;
      if (results.some((r) => r.kind === "failed")) {
        toast.warning("Nicht alle Buchungen zugeordnet", summarizeOutcomes(results));
      } else {
        toast.success(summarizeOutcomes(results));
      }
    } finally {
      applying = false;
    }
  }
</script>

<!-- With a long statement the one filled button must stay in reach, so the header sticks. -->
<div
  class={rows.length > 0
    ? "sticky top-0 z-10 -mx-7 -mt-7 mb-5 bg-background px-7 pt-7 min-[1181px]:-mx-10 min-[1181px]:px-10 [&>header]:mb-3"
    : ""}
>
  <PageHeader
    title="Bank-Abgleich"
    subtitle="Kontoauszug einlesen, Zahlungen den Rechnungen zuordnen. Ohne Online-Banking, alles bleibt lokal."
  >
    {#snippet actions()}
      {#if detectedFormat && rows.length > 0}
        {@const format = detectedFormat}
        <Button onclick={() => applyAll(format)} disabled={applying || willApplyCount === 0}>
          <Check />
          {applying
            ? "Übernehme…"
            : `${willApplyCount} ${pluralize(willApplyCount, "Zuordnung", "Zuordnungen")} übernehmen`}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>
</div>

<StatementDropZone {busy} {loaded} onFile={loadStatement} />

{#if error}
  <p class="mb-5 text-sm text-destructive" role="alert">{error}</p>
{/if}

{#if outcomes}
  <section class="mb-6">
    <h2 class="flex items-center gap-2 font-display text-base font-extrabold">
      <CheckCircle2 class="size-4 text-status-ok" />
      {summarizeOutcomes(outcomes)}
    </h2>
    {#if outcomes.some((o) => o.kind === "failed")}
      <p class="mt-0.5 text-[13px] text-muted-foreground">
        Fehlgeschlagene Buchungen stehen unten zum erneuten Versuch bereit.
      </p>
    {/if}
    <table class="data-list mt-3 text-sm">
      <tbody>
        {#each outcomes as outcome, idx (idx)}
          <tr>
            <td class="w-px whitespace-nowrap">
              <Badge variant={OUTCOME_BADGE[outcome.kind].variant}>{OUTCOME_BADGE[outcome.kind].label}</Badge>
            </td>
            <td class="whitespace-nowrap font-semibold tabular-nums">
              {#if outcome.kind === "failed"}
                {outcome.invoiceNumber}
              {:else}
                <a href={`/invoices/${outcome.invoiceId}`} use:link class="hover:underline">
                  {outcome.invoiceNumber}
                </a>
              {/if}
            </td>
            <td class="text-[13px] text-destructive">{outcome.kind === "failed" ? outcome.message : ""}</td>
            <td class="whitespace-nowrap text-right font-semibold tabular-nums">
              {formatMoney(outcome.amountCent, outcome.currency)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

{#if rows.length > 0}
  <table class="data-list text-sm">
    <thead>
      <tr>
        <th class="w-8"><span class="sr-only">Übernehmen</span></th>
        <th>Datum</th>
        <th>Buchung</th>
        <th class="text-right">Betrag</th>
        <th>Passt zu</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row, idx (idx)}
        {@const booking = row.match.booking}
        {@const items = booking.amountCent > 0 ? pickerItems(row) : []}
        <tr class="align-top [&>td]:h-auto [&>td]:py-3">
          <td>
            {#if canApply(row)}
              <Checkbox
                bind:checked={row.included}
                disabled={pickedMatch(row) === null}
                aria-label="Buchung vom {formatBookingDate(booking.valutaDate)} übernehmen"
              />
            {/if}
          </td>
          <td class="whitespace-nowrap tabular-nums text-muted-foreground">
            {formatBookingDate(booking.valutaDate)}
          </td>
          <td class="max-w-0 w-full min-w-40">
            <div class="truncate font-semibold" title={booking.partyName}>{booking.partyName}</div>
            <div class="line-clamp-2 text-[13px] text-muted-foreground" title={booking.purpose}>
              {booking.purpose}
            </div>
          </td>
          <td
            class="whitespace-nowrap text-right tabular-nums {booking.amountCent < 0
              ? 'text-muted-foreground'
              : 'font-semibold'}"
          >
            {centsToEur(booking.amountCent)}
          </td>
          <td class="w-[22rem] max-w-[22rem]">
            {#if booking.amountCent <= 0}
              <span class="text-[13px] text-muted-foreground">Ausgang, wird nicht zugeordnet</span>
            {:else}
              <div class="flex flex-col gap-1.5">
                {#if row.match.candidates.length === 0}
                  <span class="text-[13px] text-muted-foreground">Kein Treffer</span>
                {/if}
                {#each row.match.candidates as candidate, candidateIdx (candidateIdx)}
                  {@const picked = row.pickedCandidate === candidateIdx}
                  {@const remainder = remainderNote(
                    booking.amountCent,
                    openBalanceCent(candidate.invoice),
                    candidate.invoice.currency,
                  )}
                  <button
                    type="button"
                    onclick={() => (row.pickedCandidate = candidateIdx)}
                    aria-pressed={picked}
                    class="flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors {picked
                      ? 'bg-surface-strong'
                      : 'hover:bg-surface'}"
                  >
                    <span class="flex w-full items-center gap-2">
                      <Badge variant={CONFIDENCE_TONE[candidate.confidence]}>{candidate.invoice.number}</Badge>
                      <span class="truncate text-[13px] text-muted-foreground">{candidate.invoice.customerName}</span>
                      {#if picked}
                        <Check class="ml-auto size-4 shrink-0 text-status-ok" />
                      {/if}
                    </span>
                    <span class="text-[13px] text-muted-foreground">
                      {candidateLabel(candidate)}: {candidate.reason}
                    </span>
                    <span class="text-[13px] text-muted-foreground tabular-nums">
                      {formatMoney(openBalanceCent(candidate.invoice), candidate.invoice.currency)} offen{remainder
                        ? `. ${remainder}`
                        : ""}
                    </span>
                  </button>
                {/each}
                {#if items.length > 0}
                  <Select
                    {items}
                    placeholder={row.match.candidates.length === 0 ? "Rechnung wählen…" : "Andere Rechnung wählen…"}
                    onValueChange={(invoiceId) => assignInvoice(row, invoiceId)}
                  />
                {:else}
                  <span class="text-[13px] text-muted-foreground">
                    Keine offene Rechnung in {booking.currency} zum Zuordnen.
                  </span>
                {/if}
              </div>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="mt-4 max-w-3xl text-[13px] text-muted-foreground">
    Nur markierte Buchungen werden als Zahlungen erfasst, die Rechnung wird automatisch auf „Teilbezahlt" oder „Bezahlt"
    gesetzt. Vorgeschlagen werden nur offene und teilbezahlte Rechnungen: Entwürfe, bezahlte und stornierte Rechnungen
    und Gutschriften sind ausgeschlossen. Passt kein Vorschlag, wählst du die Rechnung über „Andere Rechnung wählen" selbst
    aus.
  </p>
{/if}
