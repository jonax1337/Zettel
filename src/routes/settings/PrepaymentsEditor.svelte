<script lang="ts">
  import { Button, Input, Label, toast } from "$lib/ui";
  import { ChevronLeft, ChevronRight } from "$lib/brand-icons";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import {
    listPrepayments,
    upsertPrepayment,
    type PrepaymentRow,
    type Quarter,
  } from "$lib/db/tax-prepayments";

  const currentYear = new Date().getFullYear();

  let year = $state(currentYear);
  let prepayments = $state<PrepaymentRow[]>([]);
  let busy = $state(false);

  async function loadYear(requestedYear: number) {
    busy = true;
    try {
      const loaded = await listPrepayments(requestedYear);
      if (requestedYear === year) prepayments = loaded;
    } catch (e) {
      toast.error("Vorauszahlungen konnten nicht geladen werden", String(e));
    } finally {
      if (requestedYear === year) busy = false;
    }
  }

  $effect(() => {
    loadYear(year);
  });

  async function savePrepayment(quarter: Quarter, input: HTMLInputElement) {
    try {
      await upsertPrepayment(year, quarter, eurStringToCents(input.value));
    } catch (e) {
      toast.error("Vorauszahlung konnte nicht gespeichert werden", String(e));
    }
    await loadYear(year);
  }
</script>

<div class="flex items-center justify-between mb-1.5">
  <Label>Geleistete ESt-Vorauszahlungen</Label>
  <div class="flex items-center gap-1">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onclick={() => (year -= 1)}
      disabled={busy}
      aria-label="Vorjahr"
    >
      <ChevronLeft class="size-4" />
    </Button>
    <span class="tabular-nums font-medium px-2 min-w-[3.5rem] text-center">
      {year}
    </span>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onclick={() => (year += 1)}
      disabled={busy}
      aria-label="Folgejahr"
    >
      <ChevronRight class="size-4" />
    </Button>
  </div>
</div>
<div class="grid grid-cols-4 gap-2">
  {#each prepayments as p (p.quarter)}
    <div class="flex flex-col gap-1">
      <span class="text-xs text-muted-foreground">Q{p.quarter}</span>
      <Input
        type="text"
        inputmode="decimal"
        value={centsToEur(p.amountCent)}
        disabled={busy}
        onblur={(e) => savePrepayment(p.quarter, e.currentTarget)}
      />
    </div>
  {/each}
</div>
<p class="text-xs text-muted-foreground mt-1.5">
  Pro Steuerjahr getrennt. Die Steuer-Rücklage im Dashboard rechnet immer mit den Werten des aktuellen Kalenderjahres ({currentYear}). Andere Jahre kannst du hier zur Historie erfassen — z. B. Folgejahres-Vorauszahlungen aus einem Anpassungsbescheid.
</p>
