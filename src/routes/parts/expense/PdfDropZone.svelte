<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { onMount } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { Button, toast } from "$lib/ui";
  import { FileUp, Loader2 } from "$lib/brand-icons";
  import { listenForFileDrop } from "../entity/file-drop";
  import { pickDroppedPdf } from "./dropped-files";

  type Props = {
    importing: boolean;
    onFile: (path: string) => void;
    title?: string;
    hint?: string;
    busyLabel?: string;
    class?: string;
  };
  let {
    importing,
    onFile,
    title = "PDF oder E-Rechnung hierher ziehen.",
    hint = "Zettel liest Lieferant, Datum und Beträge aus ZUGFeRD-Dateien aus.",
    busyLabel = "ZUGFeRD-Daten werden gelesen…",
    class: klass = "",
  }: Props = $props();

  let dropHover = $state(false);

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
      toast.error("Datei-Dialog fehlgeschlagen", errorMessage(e));
    }
  }

  onMount(() => listenForFileDrop({ onHover: (over) => (dropHover = over), onDrop: handleDrop }));
</script>

<div
  class="flex items-center gap-3.5 rounded-xl border-[1.5px] border-dashed px-4 py-3.5 text-sm text-muted-foreground transition-colors {dropHover
    ? 'border-ring bg-surface'
    : 'border-input'} {klass}"
>
  {#if importing}
    <Loader2 class="size-5 shrink-0 animate-spin" />
    <span>{busyLabel}</span>
  {:else}
    <FileUp class="size-5 shrink-0" />
    <div class="min-w-0">
      <span class="font-semibold text-foreground">{title}</span>
      {hint}
    </div>
    <Button type="button" variant="outline" class="ml-auto" onclick={pickFile}>Datei wählen</Button>
  {/if}
</div>
