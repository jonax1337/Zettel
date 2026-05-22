<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { parseBankStatement } from "$lib/sidecar/bank";
  import { matchBookings, type BookingMatch } from "$lib/bank/match";
  import { listInvoices, type InvoiceListRow } from "$lib/db/invoices";
  import { addPayment } from "$lib/db/invoice-payments";
  import { formatDate, fromIsoDate } from "$lib/utils/date";
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
  import { Upload, CheckCircle2, AlertCircle, FileUp } from "@lucide/svelte";

  let busy = $state(false);
  let parsing = $state(false);
  let applying = $state(false);
  let error = $state<string | null>(null);

  let detectedFormat = $state<"camt" | "mt940" | null>(null);
  let matches = $state<BookingMatch[]>([]);
  let selectedCandidateIdx = $state<Record<number, number | null>>({});
  let included = $state<Record<number, boolean>>({});

  async function pickFile() {
    const picked = await open({
      multiple: false,
      filters: [
        { name: "Kontoauszug (CAMT / MT940)", extensions: ["xml", "sta", "txt"] },
      ],
    });
    if (typeof picked !== "string") return;

    parsing = true;
    error = null;
    matches = [];
    detectedFormat = null;
    try {
      const result = await parseBankStatement(picked, "auto");
      if (!result.success) {
        error = `${result.error.code}: ${result.error.message}`;
        toast.error("Datei konnte nicht geparst werden", result.error.message);
        return;
      }
      detectedFormat = result.format;
      const allInvoices = await listInvoices({});
      const m = matchBookings(result.bookings, allInvoices);
      matches = m;
      // Default-Auswahl je Booking.
      const sel: Record<number, number | null> = {};
      const inc: Record<number, boolean> = {};
      m.forEach((bm, idx) => {
        sel[idx] = bm.defaultPick;
        inc[idx] = bm.defaultPick !== null && bm.candidates[bm.defaultPick]?.confidence === "high";
      });
      selectedCandidateIdx = sel;
      included = inc;
      toast.success(
        `${m.length} Buchung${m.length === 1 ? "" : "en"} eingelesen`,
        `${m.filter((bm) => bm.candidates.length > 0).length} Treffer-Kandidaten`,
      );
    } catch (e) {
      error = String(e);
      toast.error("Parse fehlgeschlagen", String(e));
    } finally {
      parsing = false;
    }
  }

  function setSelected(bookingIdx: number, candIdx: number) {
    selectedCandidateIdx[bookingIdx] = candIdx;
  }

  function toggleIncluded(bookingIdx: number) {
    included[bookingIdx] = !included[bookingIdx];
  }

  const willApplyCount = $derived(
    Object.keys(included).filter((k) => included[+k]).length,
  );

  async function applyAll() {
    if (applying) return;
    applying = true;
    let applied = 0;
    let failed = 0;
    try {
      for (let i = 0; i < matches.length; i++) {
        if (!included[i]) continue;
        const candIdx = selectedCandidateIdx[i];
        if (candIdx === null || candIdx === undefined) continue;
        const cand = matches[i].candidates[candIdx];
        if (!cand) continue;
        const booking = matches[i].booking;
        try {
          await addPayment({
            invoiceId: cand.invoice.id,
            paidAt: bookingDateToUnix(booking.valutaDate),
            amountCent: booking.amountCent,
            source: detectedFormat === "mt940" ? "mt940" : "camt053",
            notes: booking.purpose || null,
          });
          applied += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) {
        toast.success(`${applied} Zahlung${applied === 1 ? "" : "en"} zugeordnet`);
      } else {
        toast.warning(
          `${applied} zugeordnet, ${failed} fehlgeschlagen`,
          "Bitte die Detail-Ansicht prüfen.",
        );
      }
      // Reset
      matches = [];
      detectedFormat = null;
      selectedCandidateIdx = {};
      included = {};
    } finally {
      applying = false;
    }
  }

  function bookingDateToUnix(iso: string): number {
    if (!iso) return Math.floor(Date.now() / 1000);
    return fromIsoDate(iso);
  }

  function confidenceBadge(c: "high" | "medium" | "low") {
    return c === "high" ? "success" : c === "medium" ? "warning" : "outline";
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
        Format: {detectedFormat === "camt" ? "CAMT.053" : "MT940"}
      </Badge>
    {/if}
    {#if error}
      <p class="text-sm text-destructive mt-2">{error}</p>
    {/if}
  </CardContent>
</Card>

{#if matches.length > 0}
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
        {#each matches as bm, idx (idx)}
          {@const sel = selectedCandidateIdx[idx]}
          <tr class="border-t hover:bg-muted/30 transition-colors {bm.booking.amountCent <= 0 ? 'opacity-50' : ''}">
            <td class="px-4 py-3">
              {#if bm.candidates.length > 0 && bm.booking.amountCent > 0}
                <Checkbox checked={included[idx] ?? false} onCheckedChange={() => toggleIncluded(idx)} />
              {/if}
            </td>
            <td class="px-4 py-3 text-muted-foreground tabular-nums text-xs">
              {bm.booking.valutaDate}
            </td>
            <td class="px-4 py-3 text-right font-mono tabular-nums {bm.booking.amountCent < 0 ? 'text-muted-foreground' : 'font-medium'}">
              {centsToEur(bm.booking.amountCent)}
            </td>
            <td class="px-4 py-3 text-muted-foreground truncate max-w-[14rem]">{bm.booking.partyName}</td>
            <td class="px-4 py-3 text-muted-foreground text-xs truncate max-w-[18rem]">{bm.booking.purpose}</td>
            <td class="px-4 py-3">
              {#if bm.booking.amountCent <= 0}
                <span class="text-xs text-muted-foreground">Geldausgang — ignoriert</span>
              {:else if bm.candidates.length === 0}
                <span class="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <AlertCircle class="size-3" /> Kein Treffer
                </span>
              {:else}
                <div class="flex flex-col gap-1">
                  {#each bm.candidates as cand, ci (ci)}
                    <button
                      type="button"
                      onclick={() => setSelected(idx, ci)}
                      class={`flex items-center gap-2 text-left px-2 py-1 rounded-md text-xs transition-colors ${
                        sel === ci ? "bg-accent text-accent-foreground" : "hover:bg-accent/40"
                      }`}
                    >
                      {#if sel === ci}
                        <CheckCircle2 class="size-3.5 text-primary shrink-0" />
                      {/if}
                      <Badge variant={confidenceBadge(cand.confidence)} class="text-[9px] uppercase">
                        {cand.confidence}
                      </Badge>
                      <span class="font-mono">{cand.invoice.number}</span>
                      <span class="text-muted-foreground truncate">· {cand.invoice.customerName}</span>
                      <span class="ml-auto text-muted-foreground tabular-nums">
                        {centsToEur(Math.abs(cand.invoice.total) - (cand.invoice.amountPaidCent ?? 0))} offen
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
    <Button onclick={applyAll} disabled={applying || willApplyCount === 0}>
      {applying ? "Wende an…" : `${willApplyCount} Zahlung${willApplyCount === 1 ? "" : "en"} zuordnen`}
    </Button>
    <p class="text-xs text-muted-foreground">
      Nur markierte Buchungen werden als Zahlungen erfasst — die Rechnung wird automatisch auf
      „Teilbezahlt" oder „Bezahlt" gesetzt.
    </p>
  </div>
{/if}
