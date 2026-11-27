<script lang="ts">
  import { Label, Slider } from "$lib/ui";
  import CheckField from "./CheckField.svelte";

  const MAX_PERCENT = 50;
  const SLIDER_LABELS = [0, MAX_PERCENT / 2, MAX_PERCENT];

  type Props = { enabled: boolean; percent: number };
  let { enabled = $bindable(), percent = $bindable() }: Props = $props();
</script>

<CheckField
  bind:checked={enabled}
  label="Pauschal-Modus zusätzlich anzeigen"
  hint="Statt der detaillierten Tarif-Rechnung einfach „X % vom Umsatz brutto zurücklegen“. Wird neben der Detail-Rücklage angezeigt, du entscheidest, welcher Wert dir besser dient."
/>
{#if enabled}
  <div class="mt-4 ml-6.5 max-w-md space-y-2">
    <div class="flex items-center justify-between">
      <Label class="text-[13px]">Prozentsatz vom Brutto-Umsatz</Label>
      <span class="text-base font-bold tabular-nums">{Math.round(percent)} %</span>
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
    <p class="text-[12.5px] text-muted-foreground">
      Daumenwert für Solo-Selbstständige: <strong>30 %</strong>.
    </p>
  </div>
{/if}
