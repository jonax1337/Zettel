<script lang="ts">
  import { Checkbox, Label, Slider } from "$lib/ui";

  const MAX_PERCENT = 50;
  const SLIDER_LABELS = [0, MAX_PERCENT / 2, MAX_PERCENT];

  type Props = { enabled: boolean; percent: number };
  let { enabled = $bindable(), percent = $bindable() }: Props = $props();
</script>

<label class="flex items-start gap-2.5 text-sm cursor-pointer select-none">
  <Checkbox bind:checked={enabled} />
  <span>
    <span class="font-medium">Pauschal-Modus zusätzlich anzeigen</span>
    <span class="block text-xs text-muted-foreground mt-0.5">
      Statt der detaillierten Tarif-Rechnung einfach „X % vom Umsatz brutto zurücklegen". Wird neben der Detail-Rücklage angezeigt — du entscheidest, welcher Wert dir besser dient.
    </span>
  </span>
</label>
{#if enabled}
  <div class="mt-4 ml-7 space-y-2">
    <div class="flex items-center justify-between">
      <Label class="text-xs">Prozentsatz vom Brutto-Umsatz</Label>
      <span class="text-base font-semibold tabular-nums">{Math.round(percent)} %</span>
    </div>
    <Slider
      type="single"
      min={0}
      max={MAX_PERCENT}
      step={1}
      value={Math.round(percent)}
      onValueChange={(v) => (percent = typeof v === "number" ? v : v[0])}
    />
    <div class="flex justify-between text-[10px] text-muted-foreground tabular-nums">
      {#each SLIDER_LABELS as label (label)}
        <span>{label} %</span>
      {/each}
    </div>
    <p class="text-xs text-muted-foreground">
      Daumenwert für Solo-Selbstständige: <strong>30 %</strong>.
    </p>
  </div>
{/if}
