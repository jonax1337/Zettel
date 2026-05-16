<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu as Menu } from "bits-ui";
  import { cn } from "$lib/utils";

  type Props = {
    trigger: Snippet;
    children: Snippet;
    align?: "start" | "center" | "end";
    side?: "top" | "right" | "bottom" | "left";
    class?: string;
  };

  let { trigger, children, align = "end", side = "bottom", class: klass }: Props = $props();
</script>

<Menu.Root>
  <Menu.Trigger>
    {@render trigger()}
  </Menu.Trigger>
  <Menu.Portal>
    <Menu.Content
      {align}
      {side}
      sideOffset={6}
      class={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 min-w-[10rem] origin-[var(--bits-dropdown-menu-content-transform-origin)] overflow-hidden rounded-md border p-1 shadow-md",
        klass,
      )}
    >
      {@render children()}
    </Menu.Content>
  </Menu.Portal>
</Menu.Root>
