<script lang="ts">
  import type { Snippet } from "svelte";
  import { Label } from "$lib/ui";
  import { cn } from "$lib/utils";

  type Props = {
    label: string;
    required?: boolean;
    /** Spans both columns of the field grid. */
    wide?: boolean;
    /** Shown below the control; a snippet when the text needs markup. */
    hint?: string | Snippet;
    /** Replaces the hint while the value is not acceptable. */
    error?: string | null;
    children: Snippet;
  };
  let { label, required = false, wide = false, hint, error = null, children }: Props = $props();
</script>

<div class={cn("flex min-w-0 flex-col gap-1.5", wide && "col-span-2")}>
  <Label class="font-bold">
    {label}
    {#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
  </Label>
  {@render children()}
  {#if error}
    <p class="text-[12.5px] text-destructive" role="alert">{error}</p>
  {:else if typeof hint === "string"}
    <p class="text-[12.5px] text-muted-foreground">{hint}</p>
  {:else if hint}
    <p class="text-[12.5px] text-muted-foreground">{@render hint()}</p>
  {/if}
</div>
