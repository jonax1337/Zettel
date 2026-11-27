<script lang="ts">
  import { Button } from "$lib/ui";
  import { cn } from "$lib/utils";

  type Props = {
    path: string;
    label?: string;
    /** Shown when the page has no other way to open the file. */
    onOpen?: () => void;
    openLabel?: string;
    class?: string;
  };
  let { path, label = "PDF", onOpen, openLabel = "Öffnen", class: klass = "mb-4" }: Props = $props();
</script>

<div class={cn("flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 text-sm", klass)}>
  <div class="flex min-w-0 items-baseline gap-2">
    <span class="font-bold">{label}</span>
    <span class="min-w-0 truncate font-mono text-xs text-muted-foreground" title={path}>{path}</span>
  </div>
  {#if onOpen}
    <Button variant="outline" size="sm" onclick={onOpen}>{openLabel}</Button>
  {/if}
</div>
