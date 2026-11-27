<script lang="ts">
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
  import { Badge, Button } from "$lib/ui";
  import { formatDateTime } from "$lib/utils/date";
  import { FileText, FolderOpen } from "$lib/brand-icons";
  import type { PdfVersion } from "$lib/sidecar/invoice";

  let { versions }: { versions: PdfVersion[] } = $props();

  const hasHistory = $derived(versions.length > 1);

  function fileName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
  }
</script>

{#if hasHistory}
  <p class="text-xs text-muted-foreground">{versions.length} PDF-Versionen</p>
{/if}
<ul class="grid gap-2.5">
  {#each versions as v (v.path)}
    <li class="flex items-center gap-2.5">
      <FileText class="size-5 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-bold" title={v.path}>{fileName(v.path)}</div>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          Stand {formatDateTime(v.modifiedUnix)}
          {#if v.current && hasHistory}
            <Badge variant="calm" class="h-[18px] px-2 text-[11px]">Aktuell</Badge>
          {/if}
        </div>
      </div>
      <Button size="sm" variant="outline" onclick={() => openPath(v.path)}>Öffnen</Button>
      <button
        type="button"
        onclick={() => revealItemInDir(v.path)}
        class="inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-surface-strong hover:text-foreground"
        title="Im Ordner zeigen"
        aria-label="Im Ordner zeigen"
      >
        <FolderOpen class="size-4" />
      </button>
    </li>
  {/each}
</ul>
