<script lang="ts">
  import { columnPath, formatEuroWhole, MAX_BAR_WIDTH, niceScale } from "./chart-geometry";
  import type { ExpectedColumn, LegendItem } from "./chart-types";
  import ChartLegend from "./ChartLegend.svelte";
  import { tooltip } from "./tooltip";

  type Props = { columns: ExpectedColumn[]; ariaLabel: string };
  let { columns, ariaLabel }: Props = $props();

  const HEIGHT = 170;
  const TOP = 16;
  const BOTTOM = 24;
  const LEFT = 4;
  const RIGHT = 4;
  const COLUMN_WIDTH = 22;
  const PEAK_LABEL_HALF_WIDTH = 28;

  const LEGEND: LegendItem[] = [
    { label: "Überfällig", color: "var(--age-3)", shape: "box" },
    { label: "Fällig", color: "var(--series-1)", shape: "box" },
    { label: "Geschätzt aus Serien", color: "var(--series-1)", shape: "hatch" },
  ];

  let width = $state(360);

  const totalOf = (c: ExpectedColumn) => c.overdue + c.open + c.estimate;
  // The axis has no tick labels: the highest column carries its value, every column a tooltip.
  const scale = $derived(niceScale(0, Math.max(0, ...columns.map(totalOf)), 3));
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const band = $derived(Math.max(1, (width - LEFT - RIGHT) / Math.max(1, columns.length)));
  const columnWidth = $derived(Math.min(MAX_BAR_WIDTH, COLUMN_WIDTH, Math.floor(band * 0.7)));
  const y = (value: number) => TOP + plotHeight * (1 - value / scale.max);
  const baseline = TOP + plotHeight;
  const peak = $derived(
    columns.reduce<ExpectedColumn | null>((best, c) => (totalOf(c) > (best ? totalOf(best) : 0) ? c : best), null),
  );

  type Segment = { kind: "overdue" | "open" | "estimate"; from: number; to: number };

  function segmentsOf(column: ExpectedColumn): Segment[] {
    const parts: Segment[] = [];
    let stacked = 0;
    for (const [kind, value] of [
      ["overdue", column.overdue],
      ["open", column.open],
      ["estimate", column.estimate],
    ] as const) {
      if (value <= 0) continue;
      parts.push({ kind, from: stacked, to: stacked + value });
      stacked += value;
    }
    return parts;
  }

  const FILL = { overdue: "var(--age-3)", open: "var(--series-1)", estimate: "url(#estimate-hatch)" };

  const x = (index: number) => LEFT + band * index + (band - columnWidth) / 2;
</script>

<div class="flex flex-col gap-3">
  <ChartLegend items={LEGEND} />
  <div bind:clientWidth={width} class="w-full">
    <svg {width} height={HEIGHT} role="group" aria-label={ariaLabel} class="block">
      <defs>
        <pattern id="estimate-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--card)" />
          <rect width="2.5" height="5" fill="var(--series-1)" />
        </pattern>
      </defs>
      <line x1={LEFT} x2={width - RIGHT} y1={baseline} y2={baseline} stroke="var(--line-strong)" />

      {#each columns as column, i (column.key)}
        {@const segments = segmentsOf(column)}
        {#each segments as segment, s (segment.kind)}
          {#if s === segments.length - 1}
            <path d={columnPath(x(i), columnWidth, y(segment.from), y(segment.to))} fill={FILL[segment.kind]} />
          {:else}
            <rect x={x(i)} width={columnWidth} y={y(segment.to)} height={y(segment.from) - y(segment.to)} fill={FILL[segment.kind]} />
          {/if}
        {/each}
        <text x={LEFT + band * i + band / 2} y={HEIGHT - 6} text-anchor="middle" class="axis">{column.label}</text>
      {/each}

      {#if peak}
        {@const peakIndex = columns.indexOf(peak)}
        <text
          x={Math.min(Math.max(x(peakIndex) + columnWidth / 2, LEFT + PEAK_LABEL_HALF_WIDTH), width - RIGHT - PEAK_LABEL_HALF_WIDTH)}
          y={y(totalOf(peak)) - 6}
          text-anchor="middle"
          class="peak"
        >
          {formatEuroWhole(totalOf(peak))}
        </text>
      {/if}

      {#each columns as column, i (column.key)}
        <!-- Keyboard users reach each column by Tab; the tooltip and the label carry its figures. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <rect
          class="hit"
          role="img"
          tabindex="0"
          aria-label={column.tooltip.replaceAll("\n", ", ")}
          x={LEFT + band * i}
          y={TOP}
          width={band}
          height={plotHeight}
          rx="6"
          use:tooltip={column.tooltip}
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
