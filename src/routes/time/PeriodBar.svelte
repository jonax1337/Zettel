<script lang="ts">
  import { Button } from "$lib/ui";
  import { ChevronLeft, ChevronRight } from "$lib/brand-icons";
  import { periodContaining, shiftPeriod, type PeriodUnit, type TimePeriod } from "./period";

  type Props = { period: TimePeriod };
  let { period = $bindable() }: Props = $props();

  const UNITS: { value: PeriodUnit; label: string }[] = [
    { value: "week", label: "Woche" },
    { value: "month", label: "Monat" },
  ];

  function middleOf(p: TimePeriod): Date {
    return new Date(((p.start + p.end) / 2) * 1000);
  }
</script>

<div class="mb-4 flex flex-wrap items-center gap-2">
  <div class="inline-flex gap-1" role="group" aria-label="Zeitraum">
    {#each UNITS as unit (unit.value)}
      <Button
        size="sm"
        variant={period.unit === unit.value ? "default" : "outline"}
        aria-pressed={period.unit === unit.value}
        onclick={() => (period = periodContaining(unit.value, middleOf(period)))}
      >
        {unit.label}
      </Button>
    {/each}
  </div>
  <div class="inline-flex items-center gap-1">
    <Button size="icon" variant="outline" aria-label="Voriger Zeitraum" onclick={() => (period = shiftPeriod(period, -1))}>
      <ChevronLeft />
    </Button>
    <span class="min-w-48 px-2 text-center text-sm font-medium tabular-nums">{period.label}</span>
    <Button size="icon" variant="outline" aria-label="Nächster Zeitraum" onclick={() => (period = shiftPeriod(period, 1))}>
      <ChevronRight />
    </Button>
  </div>
  <Button size="sm" variant="ghost" onclick={() => (period = periodContaining(period.unit, new Date()))}>Heute</Button>
</div>
