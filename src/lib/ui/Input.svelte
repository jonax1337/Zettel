<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLInputAttributes & {
    class?: string;
    value?: string | number | null;
  };

  let { class: klass, value = $bindable(), ...rest }: Props = $props();
</script>

<input
  bind:value
  class={cn(
    "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input bg-paper flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    "focus-visible:border-ring focus-visible:ring-ring/20 focus-visible:ring-[3px]",
    "aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
    klass,
  )}
  {...rest}
/>
