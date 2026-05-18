<script lang="ts">
  import type { WithoutChildrenOrChild } from "bits-ui";
  import { Slider as SliderPrimitive } from "bits-ui";
  import { cn } from "$lib/utils";

  type Props = WithoutChildrenOrChild<SliderPrimitive.RootProps> & {
    class?: string;
  };

  let {
    class: klass,
    value = $bindable<number | number[]>(0),
    ref = $bindable(null),
    orientation = "horizontal",
    ...rest
  }: Props = $props();
</script>

<SliderPrimitive.Root
  bind:ref
  bind:value={value as never}
  {orientation}
  class={cn(
    "relative flex w-full touch-none items-center select-none",
    "data-[disabled]:opacity-50",
    klass,
  )}
  {...rest}
>
  {#snippet children({ thumbs })}
    <span
      class={cn(
        "bg-muted relative grow overflow-hidden rounded-full",
        "data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full",
        "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
      )}
    >
      <SliderPrimitive.Range
        class={cn(
          "bg-primary absolute",
          "data-[orientation=horizontal]:h-full",
          "data-[orientation=vertical]:w-full",
        )}
      />
    </span>
    {#each thumbs as i (i)}
      <SliderPrimitive.Thumb
        index={i}
        class={cn(
          "block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm transition-[color,box-shadow]",
          "hover:ring-4 hover:ring-primary/20",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      />
    {/each}
  {/snippet}
</SliderPrimitive.Root>
