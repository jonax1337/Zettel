<script lang="ts">
  import { onMount } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { toast } from "$lib/ui";
  import { FileUp, Loader2 } from "$lib/brand-icons";
  import { pickDroppedPdf } from "./dropped-files";

  type Props = {
    importing: boolean;
    onFile: (path: string) => void;
    hint?: string;
    busyLabel?: string;
  };
  let {
    importing,
    onFile,
    hint = "ZUGFeRD/Factur-X-Daten werden automatisch übernommen.",
    busyLabel = "ZUGFeRD-Daten werden gelesen…",
  }: Props = $props();

  let dropHover = $state(false);

  const zoneClass = $derived(
    dropHover
      ? "border-primary bg-primary/5"
      : importing
        ? "border-muted bg-muted/30"
        : "border-muted-foreground/25 hover:border-muted-foreground/50",
  );

  function handleDrop(paths: string[]) {
    const { pdf, ignoredCount } = pickDroppedPdf(paths);
    if (!pdf) {
      if (paths.length > 0) toast.warning("Nur PDF-Dateien werden unterstützt.");
      return;
    }
    if (ignoredCount > 0) {
      toast.warning(
        "Nur eine PDF pro Vorgang",
        `${ignoredCount} weitere ${ignoredCount === 1 ? "Datei wurde" : "Dateien wurden"} ignoriert — bitte einzeln nacheinander ablegen.`,
      );
    }
    onFile(pdf);
  }

  async function pickFile() {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (typeof selected === "string") onFile(selected);
    } catch (e) {
      toast.error("Datei-Dialog fehlgeschlagen", String(e));
    }
  }

  onMount(() => {
    let disposed = false;
    let stopListening: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "over") {
          dropHover = true;
        } else if (payload.type === "leave") {
          dropHover = false;
        } else if (payload.type === "drop") {
          dropHover = false;
          handleDrop(payload.paths);
        }
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stopListening = unlisten;
      })
      .catch((e) => toast.warning("Drag & Drop nicht verfügbar", String(e)));

    return () => {
      disposed = true;
      stopListening?.();
    };
  });
</script>

<div class="mb-6 rounded-lg border-2 border-dashed p-6 text-center transition-colors {zoneClass}">
  {#if importing}
    <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 class="size-4 animate-spin" />
      <span>{busyLabel}</span>
    </div>
  {:else}
    <div class="flex flex-col items-center gap-3">
      <FileUp class="size-8 text-muted-foreground" />
      <div class="text-sm">
        <span class="font-medium">PDF hierher ziehen</span>
        <span class="text-muted-foreground"> oder </span>
        <button type="button" onclick={pickFile} class="font-medium text-primary hover:underline">
          Datei auswählen
        </button>
      </div>
      <p class="text-xs text-muted-foreground">{hint}</p>
    </div>
  {/if}
</div>
