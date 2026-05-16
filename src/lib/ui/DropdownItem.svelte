<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu as Menu } from "bits-ui";
  import { cn } from "$lib/utils";

  type Props = {
    onSelect?: () => void;
    disabled?: boolean;
    destructive?: boolean;
    class?: string;
    children?: Snippet;
  };

  let { onSelect, disabled, destructive = false, class: klass, children }: Props = $props();
</script>

<Menu.Item
  {disabled}
  onSelect={() => onSelect?.()}
  class={cn(
    "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none [&_svg]:size-4 [&_svg]:shrink-0",
    destructive &&
      "text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive",
    klass,
  )}
>
  {@render children?.()}
</Menu.Item>
