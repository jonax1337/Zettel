<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "@lucide/svelte";
  import { Button } from "$lib/ui";

  type Props = {
    count: number;
    label?: string;
    onClear?: () => void;
    children?: Snippet;
  };
  let { count, label, onClear, children }: Props = $props();
</script>

{#if count > 0}
  <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border bg-card px-4 py-2 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
    <span class="text-sm font-medium tabular-nums">
      {count} {label ?? "ausgewählt"}
    </span>
    <div class="h-5 w-px bg-border"></div>
    {@render children?.()}
    {#if onClear}
      <Button size="icon" variant="ghost" onclick={onClear} aria-label="Auswahl löschen">
        <X class="size-4" />
      </Button>
    {/if}
  </div>
{/if}
