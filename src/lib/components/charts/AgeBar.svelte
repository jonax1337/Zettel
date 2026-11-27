<script lang="ts">
  import { centsToEur } from "$lib/utils/money";
  import { tooltip } from "./tooltip";

  type Bucket = { id: string; label: string; count: number; total: number };
  type Props = { buckets: Bucket[]; ariaLabel: string };
  let { buckets, ariaLabel }: Props = $props();

  const MIN_SEGMENT_PX = 6;

  const colorOf = (index: number) => `var(--age-${index})`;
  const describe = (b: Bucket) =>
    `${b.label}\n${centsToEur(b.total)} · ${b.count} ${b.count === 1 ? "Rechnung" : "Rechnungen"}`;
  const segments = $derived(
    buckets.map((bucket, index) => ({ bucket, index })).filter(({ bucket }) => bucket.total > 0),
  );
</script>

<div role="group" aria-label={ariaLabel}>
  <div class="my-4 flex h-5 gap-0.5">
    {#each segments as { bucket, index } (bucket.id)}
      <!-- Keyboard users reach each segment by Tab; the tooltip and the label carry its figures. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <span
        role="img"
        tabindex="0"
        aria-label={describe(bucket).replaceAll("\n", ", ")}
        class="rounded outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
        style="flex: {bucket.total} 1 0; min-width: {MIN_SEGMENT_PX}px; background: {colorOf(index)}"
        use:tooltip={describe(bucket)}
      ></span>
    {/each}
  </div>
  <ul class="grid gap-2 text-[13px] tabular-nums">
    {#each buckets as bucket, index (bucket.id)}
      <li class="flex items-center gap-2">
        <i class="size-2.5 flex-none rounded-[3px]" style="background: {colorOf(index)}"></i>
        <span class="text-muted-foreground">{bucket.label}</span>
        <b class="ml-auto font-semibold">{centsToEur(bucket.total)}</b>
      </li>
    {/each}
  </ul>
</div>
