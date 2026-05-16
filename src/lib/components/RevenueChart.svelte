<script lang="ts">
  import type { MonthlyRevenuePoint } from "$lib/db/invoices";
  import { centsToEur } from "$lib/utils/money";

  type Props = { data: MonthlyRevenuePoint[] };
  let { data }: Props = $props();

  const max = $derived(Math.max(1, ...data.map((d) => d.paidTotal)));
  let hoverIdx = $state<number | null>(null);

  const hovered = $derived(hoverIdx !== null ? data[hoverIdx] : null);

  const totalPaid = $derived(data.reduce((sum, d) => sum + d.paidTotal, 0));
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-baseline justify-between">
    <div>
      <div class="text-xs text-muted-foreground uppercase tracking-wider">
        Umsatz · letzte {data.length} Monate
      </div>
      <div class="text-2xl font-semibold mt-1 tabular-nums">
        {centsToEur(totalPaid)}
      </div>
    </div>
    {#if hovered}
      <div class="text-right text-sm">
        <div class="text-muted-foreground text-xs">{hovered.label} {hovered.year}</div>
        <div class="font-mono tabular-nums">{centsToEur(hovered.paidTotal)}</div>
      </div>
    {/if}
  </div>

  <div class="relative">
    <div class="flex items-end gap-1 h-32" onmouseleave={() => (hoverIdx = null)} role="img" aria-label="Monatlicher Umsatz">
      {#each data as d, i (i)}
        {@const pct = (d.paidTotal / max) * 100}
        <button
          type="button"
          class="group flex-1 flex flex-col items-stretch justify-end h-full min-w-0 cursor-default"
          onmouseenter={() => (hoverIdx = i)}
          onfocus={() => (hoverIdx = i)}
          aria-label={`${d.label} ${d.year}: ${centsToEur(d.paidTotal)}`}
        >
          <div
            class="bar w-full rounded-sm transition-all duration-200"
            class:active={hoverIdx === i}
            style="height: {Math.max(2, pct)}%;"
          ></div>
        </button>
      {/each}
    </div>
    <div class="flex gap-1 mt-1.5">
      {#each data as d, i (i)}
        <div
          class="flex-1 text-center text-[10px] tabular-nums transition-colors"
          class:text-foreground={hoverIdx === i}
          class:text-muted-foreground={hoverIdx !== i}
        >
          {d.label}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .bar {
    background: var(--color-muted-foreground);
    opacity: 0.35;
  }
  .bar:hover,
  .bar.active {
    background: var(--color-primary);
    opacity: 1;
  }
  button:focus-visible .bar {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
</style>
