<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, toast } from "$lib/ui";
  import { AlertTriangle, CheckCircle2, FileSpreadsheet, ShieldCheck } from "$lib/brand-icons";
  import { auditLogCsv, loadAuditLogForExport } from "$lib/db/audit";
  import { verifyInvoiceChain, type IntegrityProblem, type IntegrityProblemKind, type IntegrityReport } from "$lib/db/seals";
  import { formatDateTime, toIsoDate, nowUnix } from "$lib/utils/date";
  import { pluralize } from "../parts/entity/format";
  import { saveTextFileWithDialog } from "../parts/reports/save-text-file";

  const PROBLEM_TEXT: Record<IntegrityProblemKind, string> = {
    chain_broken: "Die Hash-Kette ist an dieser Stelle unterbrochen.",
    seal_tampered: "Ein Siegel passt nicht zu seinem gespeicherten Hash.",
    content_changed: "Inhalt seit dem Versiegeln verändert.",
    invoice_deleted: "Die versiegelte Rechnung wurde gelöscht.",
    reopened_without_seal: "Die Rechnung ist wieder ein Entwurf, ohne dass die Wiedereröffnung versiegelt wurde.",
    unsealed: "Noch nicht versiegelt.",
  };

  let report = $state<IntegrityReport | null>(null);
  let checking = $state(false);
  let exporting = $state(false);

  const errors = $derived(report?.problems.filter((p) => p.severity === "error") ?? []);
  const warnings = $derived(report?.problems.filter((p) => p.severity === "warning") ?? []);

  async function check() {
    checking = true;
    try {
      report = await verifyInvoiceChain();
    } catch (e) {
      toast.error("Integritätsprüfung fehlgeschlagen", String(e));
    } finally {
      checking = false;
    }
  }

  async function exportLog() {
    exporting = true;
    try {
      const saved = await saveTextFileWithDialog({
        defaultPath: `Zettel_Aenderungsprotokoll_${toIsoDate(nowUnix())}.csv`,
        filterName: "CSV",
        extension: "csv",
        content: auditLogCsv(await loadAuditLogForExport()),
      });
      if (saved) toast.success("Änderungsprotokoll exportiert");
    } catch (e) {
      toast.error("Export des Änderungsprotokolls fehlgeschlagen", String(e));
    } finally {
      exporting = false;
    }
  }

  function invoiceLabel(problem: IntegrityProblem): string {
    return problem.invoiceNumber ?? `Rechnung ${problem.invoiceId}`;
  }
</script>

{#snippet problemList(problems: IntegrityProblem[])}
  <ul class="space-y-1.5">
    {#each problems as problem, index (index)}
      <li class="flex items-start gap-2 text-sm {problem.severity === 'error' ? 'text-destructive' : 'text-warning'}">
        <AlertTriangle class="size-4 shrink-0 mt-0.5" />
        <span class="break-words">
          {#if problem.invoiceNumber !== null}
            <a href="/invoices/{problem.invoiceId}" use:link class="font-medium underline">{invoiceLabel(problem)}</a>
          {:else}
            <span class="font-medium">{invoiceLabel(problem)}</span>
          {/if}
          : {PROBLEM_TEXT[problem.kind]}
        </span>
      </li>
    {/each}
  </ul>
{/snippet}

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <ShieldCheck class="size-5" />
      Integritätsprüfung (GoBD)
    </CardTitle>
    <CardDescription>
      Zettel protokolliert Änderungen an Rechnungen und versiegelt ausgestellte Rechnungen in einer
      Hash-Kette. Die Prüfung vergleicht jede Rechnung mit ihrem Siegel. Das ist ein technischer
      Nachweis, keine Zertifizierung.
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onclick={check} disabled={checking}>
        <ShieldCheck /> {checking ? "Prüfe…" : "Jetzt prüfen"}
      </Button>
      <Button type="button" variant="outline" onclick={exportLog} disabled={exporting}>
        <FileSpreadsheet /> {exporting ? "Exportiere…" : "Änderungsprotokoll exportieren (CSV)"}
      </Button>
    </div>

    {#if report}
      {#if errors.length === 0}
        <div class="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 class="size-4 shrink-0" />
          <span>
            Kette intakt · {report.sealCount} {pluralize(report.sealCount, "Siegel", "Siegel")} ·
            {report.sealedInvoiceCount} {pluralize(report.sealedInvoiceCount, "Rechnung", "Rechnungen")}
          </span>
        </div>
      {:else}
        <div class="space-y-2">
          <p class="text-sm font-medium text-destructive">
            {errors.length} {pluralize(errors.length, "Auffälligkeit", "Auffälligkeiten")} gefunden
          </p>
          {@render problemList(errors)}
        </div>
      {/if}

      {#if warnings.length > 0}
        <div class="space-y-2">
          <p class="text-sm font-medium text-warning">Hinweise</p>
          {@render problemList(warnings)}
        </div>
      {/if}

      <p class="text-xs text-muted-foreground">Geprüft am {formatDateTime(report.checkedAt)}.</p>
    {/if}
  </CardContent>
</Card>
