<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { parseBankStatement } from "$lib/sidecar/bank";
  import { matchBookings, openBalance, type MatchCandidate } from "$lib/bank/match";
  import { listInvoices } from "$lib/db/invoices";
  import { addPayment } from "$lib/db/invoice-payments";
  import { nowUnix } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
  import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Checkbox,
    toast,
  } from "$lib/ui";
  import type { BadgeVariant } from "$lib/ui/Badge.svelte";
  import { Upload, CheckCircle2, AlertCircle, FileUp } from "$lib/brand-icons";
  import { pluralize } from "./parts/entity/format";
  import {
    canApply,
    paymentFor,
    toImportRows,
    type ImportRow,
    type StatementFormat,
  } from "./parts/bank/import-rows";

  const CONFIDENCE_BADGE: Record<MatchCandidate["confidence"], BadgeVariant> = {
    high: "success",
    medium: "warning",
    low: "outline",
  };
  const FORMAT_LABEL: Record<StatementFormat, string> = { camt: "CAMT.053", mt940: "MT940" };

  let parsing = $state(false);
  let applying = $state(false);
  let error = $state<string | null>(null);

  let detectedFormat = $state<StatementFormat | null>(null);
  let rows = $state<ImportRow[]>([]);

  const willApplyCount = $derived(rows.filter((r) => r.included).length);

  async function pickFile() {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "Kontoauszug (CAMT / MT940)", extensions: ["xml", "sta", "txt"] }],
      });
      if (typeof picked === "string") await loadStatement(picked);
    } catch (e) {
      toast.error("Datei-Dialog fehlgeschlagen", String(e));
    }
  }

  async function loadStatement(path: string) {
    parsing = true;
    error = null;
    rows = [];
    detectedFormat = null;
    try {
      const result = await parseBankStatement(path, "auto");
      if (!result.success) {
        error = `${result.error.code}: ${result.error.message}`;
        toast.error("Datei konnte nicht geparst werden", result.error.message);
        return;
      }
      detectedFormat = result.format;
      const matches = matchBookings(result.bookings, await listInvoices({}));
      rows = toImportRows(matches);
      toast.success(
        `${matches.length} ${pluralize(matches.length, "Buchung", "Buchungen")} eingelesen`,
        `${matches.filter((m) => m.candidates.length > 0).length} Treffer-Kandidaten`,
      );
    } catch (e) {
      error = String(e);
      toast.error("Parse fehlgeschlagen", String(e));
    } finally {
      parsing = false;
    }
  }

  function reportApplied(applied: number, errors: string[]) {
    if (errors.length === 0) {
      toast.success(`${applied} ${pluralize(applied, "Zahlung", "Zahlungen")} zugeordnet`);
      return;
    }
    toast.warning(
      `${applied} zugeordnet, ${errors.length} fehlgeschlagen`,
      `Fehlgeschlagene Buchungen bleiben zum erneuten Versuch in der Liste. ${errors[0]}`,
    );
  }

  /** Records every ticked booking; rows that fail stay in the list so they can be retried. */
  async function applyAll(format: StatementFormat) {
    if (applying) return;
    applying = true;
    try {
      const failedRows: ImportRow[] = [];
      const errors: string[] = [];
      let applied = 0;
      for (const row of rows) {
        const payment = paymentFor(row, format, nowUnix());
        if (!payment) continue;
        try {
          await addPayment(payment);
          applied += 1;
        } catch (e) {
          failedRows.push(row);
          errors.push(String(e));
        }
      }
      reportApplied(applied, errors);
      rows = failedRows;
      if (failedRows.length === 0) detectedFormat = null;
    } finally {
      applying = false;
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Bank-Import</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Kontoauszug im CAMT.053 (XML) oder MT940 (SWIFT) hochladen, Buchungen
      bestehenden Rechnungen zuordnen. Keine Online-Banking-Anbindung — reine
      Datei-Verarbeitung lokal.
    </p>
  </div>
</header>

<Card class="mb-6">
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <FileUp class="size-4" />
      Kontoauszug auswählen
    </CardTitle>
    <CardDescription>
      Dateien aus dem Online-Banking als <code>.xml</code> (CAMT.053) oder
      <code>.sta</code>/<code>.txt</code> (MT940). Format wird automatisch erkannt.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button onclick={pickFile} disabled={parsing}>
      <Upload class="size-4" />
      {parsing ? "Lese…" : "Datei wählen…"}
    </Button>
    {#if detectedFormat}
      <Badge variant="secondary" class="ml-3">
        Format: {FORMAT_LABEL[detectedFormat]}
      </Badge>
    {/if}
    {#if error}
      <p class="text-sm text-destructive mt-2">{error}</p>
    {/if}
  </CardContent>
</Card>

{#if rows.length > 0 && detectedFormat}
  {@const format = detectedFormat}
  <Card class="overflow-hidden py-0">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium w-10"></th>
          <th class="px-4 py-3 font-medium">Datum</th>
          <th class="px-4 py-3 font-medium text-right">Betrag</th>
          <th class="px-4 py-3 font-medium">Zahler</th>
          <th class="px-4 py-3 font-medium">Verwendungszweck</th>
          <th class="px-4 py-3 font-medium">Zuordnen zu</th>
        </tr>
      </thead>
      <tbody class="stagger">
        {#each rows as row, idx (idx)}
          {@const booking = row.match.booking}
          <tr class="border-t hover:bg-muted/30 transition-colors {booking.amountCent <= 0 ? 'opacity-50' : ''}">
            <td class="px-4 py-3">
              {#if canApply(row)}
                <Checkbox bind:checked={row.included} />
              {/if}
            </td>
            <td class="px-4 py-3 text-muted-foreground tabular-nums text-xs">
              {booking.valutaDate}
            </td>
            <td class="px-4 py-3 text-right font-mono tabular-nums {booking.amountCent < 0 ? 'text-muted-foreground' : 'font-medium'}">
              {centsToEur(booking.amountCent)}
            </td>
            <td class="px-4 py-3 text-muted-foreground truncate max-w-[14rem]">{booking.partyName}</td>
            <td class="px-4 py-3 text-muted-foreground text-xs truncate max-w-[18rem]">{booking.purpose}</td>
            <td class="px-4 py-3">
              {#if booking.amountCent <= 0}
                <span class="text-xs text-muted-foreground">Geldausgang — ignoriert</span>
              {:else if row.match.candidates.length === 0}
                <span class="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <AlertCircle class="size-3" /> Kein Treffer
                </span>
              {:else}
                <div class="flex flex-col gap-1">
                  {#each row.match.candidates as candidate, candidateIdx (candidateIdx)}
                    {@const picked = row.pickedCandidate === candidateIdx}
                    <button
                      type="button"
                      onclick={() => (row.pickedCandidate = candidateIdx)}
                      class="flex items-center gap-2 text-left px-2 py-1 rounded-md text-xs transition-colors {picked
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/40'}"
                    >
                      {#if picked}
                        <CheckCircle2 class="size-3.5 text-primary shrink-0" />
                      {/if}
                      <Badge variant={CONFIDENCE_BADGE[candidate.confidence]} class="text-[9px] uppercase">
                        {candidate.confidence}
                      </Badge>
                      <span class="font-mono">{candidate.invoice.number}</span>
                      <span class="text-muted-foreground truncate">· {candidate.invoice.customerName}</span>
                      <span class="ml-auto text-muted-foreground tabular-nums">
                        {centsToEur(openBalance(candidate.invoice))} offen
                      </span>
                    </button>
                  {/each}
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </Card>

  <div class="mt-6 flex items-center gap-3">
    <Button onclick={() => applyAll(format)} disabled={applying || willApplyCount === 0}>
      {applying ? "Wende an…" : `${willApplyCount} ${pluralize(willApplyCount, "Zahlung", "Zahlungen")} zuordnen`}
    </Button>
    <p class="text-xs text-muted-foreground">
      Nur markierte Buchungen werden als Zahlungen erfasst — die Rechnung wird automatisch auf
      „Teilbezahlt" oder „Bezahlt" gesetzt.
    </p>
  </div>
{/if}
