<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { Button, toast } from "$lib/ui";
  import { Copy } from "$lib/brand-icons";
  import FormSection from "./FormSection.svelte";

  let cliPath = $state<string | null>(null);

  onMount(async () => {
    cliPath = await invoke<string | null>("cli_path").catch(() => null);
  });

  async function copyPath() {
    if (!cliPath) return;
    try {
      await navigator.clipboard.writeText(cliPath);
      toast.success("Pfad kopiert");
    } catch (e) {
      toast.error("Pfad konnte nicht kopiert werden", String(e));
    }
  }
</script>

{#if cliPath}
  <FormSection
    title="Kommandozeile"
    description="Dieselben Daten per Terminal bedienen (Rechnungen, Angebote, Mahnungen, Kunden; --json für Skripte). Hilfe: zettel-cli -h. Nicht parallel zur laufenden App schreiben."
  >
    <div class="flex items-center gap-2">
      <code class="flex-1 truncate rounded-md bg-surface px-2.5 py-1.5 text-xs">{cliPath}</code>
      <Button variant="outline" size="sm" onclick={copyPath}>
        <Copy class="size-4" />
        Kopieren
      </Button>
    </div>
  </FormSection>
{/if}
