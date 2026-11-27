<script lang="ts">
  type Props = { label: string; value: string; hint?: string };

  let { label, value, hint }: Props = $props();
</script>

<!-- Figures in a StatRow are separated by hairlines, not cards. -->
<div class="flex-1 py-3.5 pr-5 not-first:border-l not-first:pl-5">
  <span class="text-[13px] text-muted-foreground">{label}</span>
  <b class="mt-0.5 block font-display text-[22px] leading-tight font-extrabold tabular-nums">{value}</b>
  {#if hint}
    <span class="text-xs text-muted-foreground">{hint}</span>
  {/if}
</div>
