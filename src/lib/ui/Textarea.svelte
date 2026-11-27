<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLTextareaAttributes & {
    class?: string;
    value?: string | null;
  };

  let { class: klass, value = $bindable(), ...rest }: Props = $props();
</script>

<textarea
  bind:value
  class={cn(
    "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/20 aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-paper flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    klass,
  )}
  {...rest}
></textarea>
