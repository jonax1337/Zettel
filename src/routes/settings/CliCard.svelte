<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, toast } from "$lib/ui";
  import { Copy } from "$lib/brand-icons";

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
  <Card>
    <CardHeader>
      <CardTitle>Kommandozeile</CardTitle>
      <CardDescription>
        Dieselben Daten per Terminal bedienen (Rechnungen, Angebote, Mahnungen, Kunden; <code>--json</code>
        für Skripte). Hilfe: <code>zettel-cli -h</code>. Nicht parallel zur laufenden App schreiben.
      </CardDescription>
    </CardHeader>
    <CardContent class="flex items-center gap-2">
      <code class="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{cliPath}</code>
      <Button variant="outline" size="sm" onclick={copyPath}>
        <Copy class="size-4" />
        Kopieren
      </Button>
    </CardContent>
  </Card>
{/if}
