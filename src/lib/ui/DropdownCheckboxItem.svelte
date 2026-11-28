<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu as Menu } from "bits-ui";
  import { Check } from "$lib/brand-icons";
  import { cn } from "$lib/utils";

  type Props = {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
    class?: string;
    children?: Snippet;
  };

  let {
    checked = $bindable(false),
    onCheckedChange,
    disabled,
    class: klass,
    children,
  }: Props = $props();
</script>

<!-- Toggles stay in the menu after a selection, so several can be flipped in one visit. -->
<Menu.CheckboxItem
  bind:checked
  {onCheckedChange}
  {disabled}
  closeOnSelect={false}
  class={cn(
    "data-highlighted:bg-foreground/10 data-disabled:pointer-events-none data-disabled:opacity-50 relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-3 pl-8 text-sm outline-hidden select-none",
    klass,
  )}
>
  {#if checked}
    <span class="absolute left-2 flex size-4 items-center justify-center"><Check class="size-4" /></span>
  {/if}
  {@render children?.()}
</Menu.CheckboxItem>
