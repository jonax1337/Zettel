<script lang="ts">
  import type { SummarySegment } from "./list-summary";

  let { segments }: { segments: SummarySegment[] } = $props();
</script>

<p class="flex flex-wrap gap-x-7 gap-y-1 px-1 pt-3 text-[13px] text-muted-foreground tabular-nums">
  {#each segments as segment (segment.label)}
    <span>
      {segment.label}
      {#if segment.value}<b class="font-bold text-foreground">{segment.value}</b>{/if}
    </span>
  {/each}
</p>
