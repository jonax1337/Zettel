<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Button, Dialog } from "$lib/ui";
  import type { ValidationReport } from "$lib/validator";

  type Props = {
    open: boolean;
    report: ValidationReport | null;
    /** Validation is running, e.g. because the report is being fetched for this dialog. */
    running: boolean;
    hasPdf: boolean;
    onRevalidate: () => void;
  };
  let { open = $bindable(), report, running, hasPdf, onRevalidate }: Props = $props();
</script>

<Dialog bind:open title="Validierung" description="Ergebnis der KoSIT-Prüfung für die erzeugte PDF.">
  <div class="flex flex-col gap-3 text-sm">
    {#if !hasPdf}
      <p class="text-muted-foreground">Für diese Rechnung wurde noch keine PDF erzeugt.</p>
    {:else if running}
      <p class="text-muted-foreground">Prüfe…</p>
    {:else if !report}
      <p class="text-muted-foreground">Die PDF konnte nicht geprüft werden. Erneut versuchen oder den Validator öffnen.</p>
    {:else if report.valid}
      <p class="text-success">Bestanden · Szenario: {report.scenario ?? "—"}</p>
    {:else}
      <p class="font-medium">{report.findings.length} Findings · Szenario: {report.scenario ?? "—"}</p>
      <ul class="flex flex-col gap-2 max-h-72 overflow-y-auto">
        {#each report.findings as finding, index (index)}
          <li class="rounded-md border border-border px-3 py-2">
            <div class="text-xs uppercase tracking-wider text-muted-foreground">
              {finding.severity}{finding.code ? ` · ${finding.code}` : ""}
            </div>
            <div>{finding.message}</div>
            {#if finding.location}
              <div class="mt-0.5 font-mono text-xs text-muted-foreground break-all">{finding.location}</div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <a href="/validate" use:link class="text-xs text-muted-foreground hover:text-foreground hover:underline">
      Weitere PDFs im Validator prüfen
    </a>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)}>Schließen</Button>
    <Button onclick={onRevalidate} disabled={!hasPdf || running}>{running ? "Prüfe…" : "Erneut prüfen"}</Button>
  {/snippet}
</Dialog>
