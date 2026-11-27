<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { onMount } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { Button, toast } from "$lib/ui";
  import { Landmark, Loader2 } from "$lib/brand-icons";
  import { listenForFileDrop } from "../entity/file-drop";

  type Props = {
    /** What is running right now ("Kontoauszug wird gelesen…"); drops and the picker are off meanwhile. */
    busy: string | null;
    /** Set once a statement is read: "kontoauszug.xml (CAMT.053) ist eingelesen, 5 Buchungen …". */
    loaded: { fileName: string; format: string; summary: string } | null;
    onFile: (path: string) => void;
  };
  let { busy, loaded, onFile }: Props = $props();

  const EXTENSIONS = ["xml", "sta", "txt"];
  let dropHover = $state(false);

  function handleDrop(paths: string[]) {
    if (busy) {
      toast.warning("Bitte warte kurz", `${busy} Lege die Datei danach ab.`);
      return;
    }
    const statement = paths.find((p) => EXTENSIONS.includes(p.split(".").pop()?.toLowerCase() ?? ""));
    if (!statement) {
      if (paths.length > 0) toast.warning("Nur CAMT.053 (.xml) und MT940 (.sta, .txt) werden unterstützt.");
      return;
    }
    if (paths.length > 1) toast.warning("Nur ein Auszug pro Vorgang", "Weitere Dateien wurden ignoriert.");
    onFile(statement);
  }

  async function pickFile() {
    try {
      const picked = await openDialog({
        multiple: false,
        filters: [{ name: "Kontoauszug (CAMT / MT940)", extensions: EXTENSIONS }],
      });
      if (typeof picked === "string") onFile(picked);
    } catch (e) {
      toast.error("Datei-Dialog fehlgeschlagen", errorMessage(e));
    }
  }

  onMount(() => listenForFileDrop({ onHover: (over) => (dropHover = over && !busy), onDrop: handleDrop }));
</script>

<div
  class="mb-5 flex items-center gap-3.5 rounded-xl border-[1.5px] border-dashed px-4 py-3.5 text-sm text-muted-foreground transition-colors {dropHover
    ? 'border-ring bg-surface'
    : 'border-input'} {busy ? 'opacity-70' : ''}"
  aria-busy={busy ? true : undefined}
>
  {#if busy}
    <Loader2 class="size-5 shrink-0 animate-spin" />
    <span>{busy}</span>
  {:else if loaded}
    <Landmark class="size-5 shrink-0" />
    <div class="min-w-0">
      <span class="font-semibold text-foreground">{loaded.fileName}</span>
      ist eingelesen ({loaded.format}), {loaded.summary}.
    </div>
    <Button type="button" variant="outline" class="ml-auto" onclick={pickFile}>Anderen Auszug wählen</Button>
  {:else}
    <Landmark class="size-5 shrink-0" />
    <div class="min-w-0">
      <span class="font-semibold text-foreground">Kontoauszug hierher ziehen.</span>
      CAMT.053 (.xml) oder MT940 (.sta, .txt) aus deinem Online-Banking, das Format wird erkannt.
    </div>
    <Button type="button" variant="outline" class="ml-auto" onclick={pickFile}>Datei wählen</Button>
  {/if}
</div>
