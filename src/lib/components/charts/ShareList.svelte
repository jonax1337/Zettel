<script lang="ts">
  import { link } from "svelte-spa-router";
  import { tooltip } from "./tooltip";

  type Item = {
    key: string | number;
    label: string;
    /** Formatted amount. */
    value: string;
    /** Formatted share of the whole, shown beside the amount; null when no whole exists. */
    share: string | null;
    /** Length of the bar relative to the longest one, 0 to 1. */
    ratio: number;
    tooltip: string;
    href: string;
  };
  type Props = { items: Item[]; ariaLabel: string };
  let { items, ariaLabel }: Props = $props();
</script>

<ul class="grid gap-3 text-[13px] tabular-nums" aria-label={ariaLabel}>
  {#each items as item (item.key)}
    <li>
      <a
        href={item.href}
        use:link
        use:tooltip={item.tooltip}
        class="block rounded outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span class="mb-1 flex gap-2">
          <span class="min-w-0 truncate">{item.label}</span>
          <b class="ml-auto flex-none font-semibold">{item.value}</b>
          <em class="w-9 flex-none text-right text-muted-foreground not-italic">{item.share ?? ""}</em>
        </span>
        <span class="block h-1 rounded-full bg-muted">
          <span class="block h-full rounded-full" style="width: {item.ratio * 100}%; background: var(--series-1)"></span>
        </span>
      </a>
    </li>
  {/each}
</ul>
