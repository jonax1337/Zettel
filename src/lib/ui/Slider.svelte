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
    ...rest
  }: Props = $props();
</script>

<SliderPrimitive.Root
  bind:ref
  bind:value={value as never}
  class={cn(
    "relative flex w-full touch-none items-center select-none",
    "data-[disabled]:opacity-50",
    klass,
  )}
  {...rest}
>
  {#snippet children({ thumbs })}
    <span class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
      <SliderPrimitive.Range class="absolute h-full bg-primary" />
    </span>
    {#each thumbs as i (i)}
      <SliderPrimitive.Thumb
        index={i}
        class={cn(
          "block size-4 shrink-0 rounded-full border-2 border-primary bg-background shadow-sm transition-colors cursor-grab active:cursor-grabbing",
          "hover:ring-4 hover:ring-primary/20",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      />
    {/each}
  {/snippet}
</SliderPrimitive.Root>
