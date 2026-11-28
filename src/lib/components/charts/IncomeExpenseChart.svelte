<script lang="ts">
  import { centsToEur } from "$lib/utils/money";
  import {
    barWidthFor,
    columnPath,
    formatAxisValue,
    formatEuroWhole,
    labelStride,
    niceScale,
  } from "./chart-geometry";
  import type { IncomeMonth, LegendItem } from "./chart-types";
  import ChartLegend from "./ChartLegend.svelte";
  import { tooltip } from "./tooltip";

  type Props = { months: IncomeMonth[]; ariaLabel: string };
  let { months, ariaLabel }: Props = $props();

  const HEIGHT = 250;
  const TOP = 16;
  const BOTTOM = 26;
  /** Room for a second axis row that names the year under each January. */
  const BOTTOM_WITH_YEARS = 40;
  const RIGHT = 6;
  const BAR_GAP = 2;
  const MIN_LABEL_WIDTH = 34;
  const AXIS_CHAR_WIDTH = 7;
  const PEAK_LABEL_HALF_WIDTH = 28;

  const LEGEND: LegendItem[] = [
    { label: "Einnahmen", color: "var(--series-1)", shape: "box" },
    { label: "Ausgaben", color: "var(--series-2)", shape: "box" },
    { label: "Einnahmen Vorjahr", color: "var(--series-ref)", shape: "line" },
  ];

  let width = $state(760);

  const scale = $derived(
    niceScale(
      Math.min(0, ...months.flatMap((m) => [m.revenue, m.expenses, m.lastYearRevenue])),
      Math.max(0, ...months.flatMap((m) => [m.revenue, m.expenses, m.lastYearRevenue])),
    ),
  );
  const left = $derived(14 + AXIS_CHAR_WIDTH * Math.max(...scale.ticks.map((t) => formatAxisValue(t).length)));
  const spansYears = $derived(new Set(months.map((m) => m.year)).size > 1);
  const plotHeight = $derived(HEIGHT - TOP - (spansYears ? BOTTOM_WITH_YEARS : BOTTOM));
  const band = $derived(Math.max(1, (width - left - RIGHT) / Math.max(1, months.length)));
  const barWidth = $derived(barWidthFor(band, 2));
  const stride = $derived(labelStride(band, MIN_LABEL_WIDTH));
  const y = (value: number) => TOP + plotHeight * (1 - (value - scale.min) / (scale.max - scale.min));
  const baseline = $derived(y(0));
  const peak = $derived(
    months.reduce<IncomeMonth | null>((best, m) => (!m.future && m.revenue > (best?.revenue ?? 0) ? m : best), null),
  );

  const center = (index: number) => left + band * index + band / 2;
  const revenueX = (index: number) => center(index) - barWidth - BAR_GAP / 2;
  const expensesX = (index: number) => center(index) + BAR_GAP / 2;

  function describe(m: IncomeMonth): string {
    const lines = [m.title];
    if (!m.future) {
      const gross = m.grossRevenue === m.revenue ? "" : ` (brutto ${centsToEur(m.grossRevenue)})`;
      lines.push(`Einnahmen ${centsToEur(m.revenue)}${gross}`, `Ausgaben ${centsToEur(m.expenses)}`);
    }
    lines.push(`Einnahmen Vorjahr ${centsToEur(m.lastYearRevenue)}`);
    return lines.join("\n");
  }
</script>

<div class="flex flex-col gap-3">
  <ChartLegend items={LEGEND} />
  <div bind:clientWidth={width} class="w-full">
    <svg {width} height={HEIGHT} role="group" aria-label={ariaLabel} class="block">
      {#each scale.ticks as tick (tick)}
        <line x1={left} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} stroke="var(--border)" />
        <text x={left - 8} y={y(tick) + 4} text-anchor="end" class="axis">{formatAxisValue(tick)}</text>
      {/each}
      <line x1={left} x2={width - RIGHT} y1={baseline} y2={baseline} stroke="var(--line-strong)" />

      {#each months as m, i (m.key)}
        {#if !m.future}
          {#if m.revenue !== 0}
            <path d={columnPath(revenueX(i), barWidth, baseline, y(m.revenue))} fill="var(--series-1)" />
          {/if}
          {#if m.expenses !== 0}
            <path d={columnPath(expensesX(i), barWidth, baseline, y(m.expenses))} fill="var(--series-2)" />
          {/if}
        {/if}
        {#if m.lastYearRevenue !== 0}
          <line
            x1={revenueX(i) - 2}
            x2={revenueX(i) + barWidth + 2}
            y1={y(m.lastYearRevenue)}
            y2={y(m.lastYearRevenue)}
            stroke="var(--series-ref)"
            stroke-width="2"
            stroke-linecap="round"
          />
        {/if}
        {#if i % stride === 0}
          <text x={center(i)} y={spansYears ? HEIGHT - 21 : HEIGHT - 7} text-anchor="middle" class="axis">{m.label}</text>
        {/if}
        {#if spansYears && m.month === 1}
          <text x={center(i)} y={HEIGHT - 6} text-anchor="middle" class="axis">{m.year}</text>
        {/if}
      {/each}

      {#if peak}
        {@const peakIndex = months.indexOf(peak)}
        <text
          x={Math.min(Math.max(revenueX(peakIndex) + barWidth / 2, left + PEAK_LABEL_HALF_WIDTH), width - RIGHT - PEAK_LABEL_HALF_WIDTH)}
          y={y(peak.revenue) - 7}
          text-anchor="middle"
          class="peak"
        >
          {formatEuroWhole(peak.revenue)}
        </text>
      {/if}

      {#each months as m, i (m.key)}
        <!-- Keyboard users reach each month by Tab; the tooltip and the label carry its figures. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <rect
          class="hit"
          role="img"
          tabindex="0"
          aria-label={describe(m).replaceAll("\n", ", ")}
          x={left + band * i}
          y={TOP}
          width={band}
          height={plotHeight}
          rx="6"
          use:tooltip={describe(m)}
        />
      {/each}
    </svg>
  </div>
</div>

<style>
  .axis {
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    fill: var(--muted-foreground);
  }
  .peak {
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 700;
    fill: var(--foreground);
  }
  .hit {
    fill: transparent;
    outline: none;
  }
  .hit:hover,
  .hit:focus-visible {
    fill: var(--foreground);
    fill-opacity: 0.06;
  }
  .hit:focus-visible {
    stroke: var(--ring);
    stroke-width: 2;
  }
</style>
