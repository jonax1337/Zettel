<script lang="ts">
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
  import { Badge } from "$lib/ui";
  import { formatDateTime } from "$lib/utils/date";
  import { Clock, FileText, FolderOpen, History } from "$lib/brand-icons";
  import type { PdfVersion } from "$lib/sidecar/invoice";

  let { versions }: { versions: PdfVersion[] } = $props();

  const hasHistory = $derived(versions.length > 1);
</script>

<div class="mb-4 rounded-lg border">
  {#if hasHistory}
    <div class="flex items-center gap-1.5 border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <History class="size-3.5" />
      PDF-Versionen
      <Badge variant="secondary" class="ml-auto">{versions.length}</Badge>
    </div>
  {/if}
  <ul class="divide-y divide-border/60">
    {#each versions as v (v.path)}
      <li class="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
        <div class="flex min-w-0 items-center gap-2">
          <Clock class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="tabular-nums text-muted-foreground">{formatDateTime(v.modifiedUnix)}</span>
          {#if v.current && hasHistory}
            <Badge variant="outline">Aktuell</Badge>
          {/if}
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onclick={() => openPath(v.path)}
            class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Öffnen"
          >
            <FileText class="size-3.5" /> Öffnen
          </button>
          <button
            type="button"
            onclick={() => revealItemInDir(v.path)}
            class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Im Ordner zeigen"
          >
            <FolderOpen class="size-3.5" />
          </button>
        </div>
      </li>
    {/each}
  </ul>
</div>
