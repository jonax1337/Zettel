<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import { Card, CardContent } from "$lib/ui";
  import type { IconProps } from "$lib/brand-icons";
  import { cn } from "$lib/utils";

  type Props = {
    label: string;
    icon: Component<IconProps>;
    /** Formatted value; null while the figure is still loading. */
    value: string | null;
    valueClass?: string;
    iconClass?: string;
    /** Makes the whole card a link-like button. */
    onclick?: () => void;
    caption?: Snippet;
    class?: string;
  };
  let { label, icon: Icon, value, valueClass, iconClass, onclick, caption, class: className }: Props =
    $props();
</script>

<Card
  class={cn(
    onclick &&
      "cursor-pointer hover:bg-muted/30 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200",
    className,
  )}
  {onclick}
>
  <CardContent>
    <div class="flex items-center justify-between">
      <span class="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      <Icon class={cn("size-4", iconClass ?? "text-muted-foreground")} />
    </div>
    <div class={cn("text-2xl font-semibold mt-2 tabular-nums whitespace-nowrap", valueClass)}>{value ?? "…"}</div>
    {#if caption}
      <div class="text-xs text-muted-foreground mt-1">{@render caption()}</div>
    {/if}
  </CardContent>
</Card>
