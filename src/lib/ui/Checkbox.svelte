<script lang="ts">
  import type { WithoutChildren } from "bits-ui";
  import { Checkbox as CheckboxPrimitive } from "bits-ui";
  import { Check, Minus } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  type Props = WithoutChildren<CheckboxPrimitive.RootProps> & {
    class?: string;
  };

  let {
    class: klass,
    checked = $bindable(false),
    indeterminate = $bindable(false),
    ref = $bindable(null),
    ...rest
  }: Props = $props();
</script>

<CheckboxPrimitive.Root
  bind:ref
  bind:checked
  bind:indeterminate
  class={cn(
    "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-[color,box-shadow,background-color] outline-none",
    "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary",
    "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary",
    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
    "aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "active:scale-[0.92]",
    "dark:bg-input/30 dark:data-[state=checked]:bg-primary",
    klass,
  )}
  {...rest}
>
  {#snippet children({ checked: isChecked, indeterminate: isIndeterminate })}
    <div class="grid place-items-center text-current size-full">
      {#if isIndeterminate}
        <Minus class="size-3.5" />
      {:else if isChecked}
        <Check class="size-3.5" />
      {/if}
    </div>
  {/snippet}
</CheckboxPrimitive.Root>
