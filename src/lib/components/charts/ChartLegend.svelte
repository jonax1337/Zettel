<script lang="ts">
  import type { LegendItem } from "./chart-types";

  let { items }: { items: LegendItem[] } = $props();

  const HATCH = (color: string) =>
    `repeating-linear-gradient(135deg, ${color} 0 2px, transparent 2px 4px)`;
</script>

<ul class="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
  {#each items as item (item.label)}
    <li class="inline-flex items-center gap-1.5">
      {#if item.shape === "line"}
        <i class="inline-block h-0.5 w-3.5 rounded-full" style="background: {item.color}"></i>
      {:else if item.shape === "hatch"}
        <i
          class="inline-block size-2.5 rounded-[3px] outline outline-1 -outline-offset-1"
          style="background: {HATCH(item.color)}; outline-color: {item.color}"
        ></i>
      {:else}
        <i class="inline-block size-2.5 rounded-[3px]" style="background: {item.color}"></i>
      {/if}
      {item.label}
    </li>
  {/each}
</ul>
