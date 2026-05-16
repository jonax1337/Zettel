<script lang="ts" generics="T extends string">
  import { Select as SelectPrimitive } from "bits-ui";
  import { Check, ChevronDown } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Item = { value: T; label: string; disabled?: boolean };

  type Props = {
    items: Item[];
    value?: T;
    placeholder?: string;
    disabled?: boolean;
    name?: string;
    class?: string;
    onValueChange?: (value: T) => void;
  };

  let {
    items,
    value = $bindable(),
    placeholder = "Auswählen…",
    disabled,
    name,
    class: klass,
    onValueChange,
  }: Props = $props();

  const selectedLabel = $derived(items.find((i) => i.value === value)?.label);
</script>

<SelectPrimitive.Root
  type="single"
  bind:value
  {disabled}
  {name}
  onValueChange={(v) => onValueChange?.(v as T)}
  items={items.map((i) => ({ value: i.value, label: i.label, disabled: i.disabled }))}
>
  <SelectPrimitive.Trigger
    class={cn(
      "border-input data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
      klass,
    )}
  >
    <span class={selectedLabel ? "" : "text-muted-foreground"}>
      {selectedLabel ?? placeholder}
    </span>
    <ChevronDown class="size-4 opacity-50" />
  </SelectPrimitive.Trigger>

  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      sideOffset={4}
      class="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-[var(--bits-select-content-available-height)] min-w-[var(--bits-select-anchor-width)] origin-[var(--bits-select-content-transform-origin)] overflow-y-auto rounded-md border shadow-md outline-none"
    >
      <SelectPrimitive.Viewport class="p-1">
        {#each items as item (item.value)}
          <SelectPrimitive.Item
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            class="focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none"
          >
            {#snippet children({ selected })}
              {#if selected}
                <span class="absolute left-2 flex size-3.5 items-center justify-center">
                  <Check class="size-4" />
                </span>
              {/if}
              {item.label}
            {/snippet}
          </SelectPrimitive.Item>
        {/each}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
</SelectPrimitive.Root>
