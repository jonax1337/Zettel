<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
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
      toast.error("Vorauszahlungen konnten nicht geladen werden", errorMessage(e));
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
      toast.error("Vorauszahlung konnte nicht gespeichert werden", errorMessage(e));
    }
    await loadYear(year);
  }
</script>

<div class="mb-3 flex items-center gap-1">
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
  <span class="min-w-14 px-2 text-center font-bold tabular-nums">{year}</span>
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
<div class="grid grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-4">
  {#each prepayments as p (p.quarter)}
    <div class="flex flex-col gap-1.5">
      <Label class="font-bold">Q{p.quarter}</Label>
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
<p class="mt-2.5 text-[12.5px] text-muted-foreground">
  Pro Steuerjahr getrennt. Die Steuer-Rücklage rechnet immer mit den Werten des aktuellen Kalenderjahres ({currentYear}). Andere Jahre kannst du hier zur Historie erfassen, zum Beispiel Vorauszahlungen des Folgejahres aus einem Anpassungsbescheid.
</p>
