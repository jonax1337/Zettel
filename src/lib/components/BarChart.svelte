<script lang="ts">
  import { centsToEur } from "$lib/utils/money";

  type Bar = { label: string; value: number; sublabel?: string };
  type Props = {
    bars: Bar[];
    height?: number;
    /** Show currency formatting for tooltip; otherwise integer count. */
    money?: boolean;
    ariaLabel?: string;
  };
  let { bars, height = 160, money = true, ariaLabel }: Props = $props();

  const max = $derived(Math.max(1, ...bars.map((b) => b.value)));
  let hoverIdx = $state<number | null>(null);
  const hovered = $derived(hoverIdx !== null ? bars[hoverIdx] : null);

  function fmt(v: number): string {
    return money ? centsToEur(v) : String(v);
  }
</script>

<div class="flex flex-col gap-2">
  <div class="h-5 text-right text-xs">
    {#if hovered}
      <span class="text-muted-foreground">{hovered.label}{hovered.sublabel ? ` · ${hovered.sublabel}` : ""}: </span>
      <span class="font-mono tabular-nums">{fmt(hovered.value)}</span>
    {/if}
  </div>
  <div
    class="flex items-end gap-1"
    style="height: {height}px"
    onmouseleave={() => (hoverIdx = null)}
    role="img"
    aria-label={ariaLabel}
  >
    {#each bars as b, i (i)}
      {@const pct = (b.value / max) * 100}
      <button
        type="button"
        class="group flex-1 flex flex-col items-stretch justify-end h-full min-w-0 cursor-default"
        onmouseenter={() => (hoverIdx = i)}
        onfocus={() => (hoverIdx = i)}
        aria-label={`${b.label}: ${fmt(b.value)}`}
      >
        <div
          class="bar w-full rounded-sm transition-all duration-200"
          class:active={hoverIdx === i}
          style="height: {Math.max(2, pct)}%;"
        ></div>
      </button>
    {/each}
  </div>
  <div class="flex gap-1">
    {#each bars as b, i (i)}
      <div
        class="flex-1 text-center text-[10px] tabular-nums truncate transition-colors"
        class:text-foreground={hoverIdx === i}
        class:text-muted-foreground={hoverIdx !== i}
      >
        {b.label}
      </div>
    {/each}
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
