<script lang="ts">
  import { Button, Segmented } from "$lib/ui";
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

<div class="mb-3 flex flex-wrap items-center gap-2">
  <Segmented
    ariaLabel="Zeitraum"
    items={UNITS}
    bind:value={() => period.unit, (unit) => (period = periodContaining(unit as PeriodUnit, middleOf(period)))}
  />
  <Button size="icon" variant="outline" aria-label="Voriger Zeitraum" onclick={() => (period = shiftPeriod(period, -1))}>
    <ChevronLeft />
  </Button>
  <b class="min-w-48 px-1 text-center font-display text-base font-extrabold tabular-nums">{period.label}</b>
  <Button size="icon" variant="outline" aria-label="Nächster Zeitraum" onclick={() => (period = shiftPeriod(period, 1))}>
    <ChevronRight />
  </Button>
  <Button size="sm" variant="ghost" onclick={() => (period = periodContaining(period.unit, new Date()))}>Heute</Button>
</div>
