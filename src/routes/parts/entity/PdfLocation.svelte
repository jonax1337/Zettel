<script lang="ts">
  import { Button } from "$lib/ui";

  type Props = {
    path: string;
    /** Shown when the page has no other way to open the file. */
    onOpen?: () => void;
  };
  let { path, onOpen }: Props = $props();
</script>

<div class="mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
  <div class="flex min-w-0 items-baseline gap-2">
    <span class="font-medium">PDF</span>
    <span class="min-w-0 truncate font-mono text-xs text-muted-foreground" title={path}>{path}</span>
  </div>
  {#if onOpen}
    <Button variant="outline" size="sm" onclick={onOpen}>Öffnen</Button>
  {/if}
</div>
