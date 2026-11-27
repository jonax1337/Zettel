<script lang="ts">
  import { link } from "svelte-spa-router";
  import { cn } from "$lib/utils";

  type Tab = { href: string; label: string; count?: number; tone?: "late" };
  type Props = {
    items: Tab[];
    /** The `href` of the current tab. */
    active: string;
    ariaLabel?: string;
  };

  let { items, active, ariaLabel = "Ansicht" }: Props = $props();
</script>

<nav aria-label={ariaLabel} class="mb-4 flex gap-5.5 border-b">
  {#each items as item (item.href)}
    {@const current = item.href === active}
    <a
      href={item.href}
      use:link
      aria-current={current ? "page" : undefined}
      class={cn(
        "relative inline-flex items-center gap-1.5 pt-2 pb-2.5 font-bold transition-colors",
        current
          ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-sm after:bg-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {item.label}
      {#if item.count !== undefined}
        <span
          class={cn(
            "rounded-full px-1.75 text-xs leading-[18px] font-bold",
            item.tone === "late"
              ? "bg-status-bad-bg text-status-bad"
              : "bg-status-calm-bg text-muted-foreground",
          )}
        >
          {item.count}
        </span>
      {/if}
    </a>
  {/each}
</nav>
