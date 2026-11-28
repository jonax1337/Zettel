<script lang="ts">
  import { Badge } from "$lib/ui";
  import type { ValidationReport } from "$lib/validator";
  import { ShieldCheck, ShieldAlert } from "$lib/brand-icons";
  import { baseName, findingSeverityMeta, validationVerdictLabel } from "./validate-files";

  type Props = {
    report: ValidationReport;
    filePath: string;
  };

  let { report, filePath }: Props = $props();
</script>

<div class="mt-8 mb-2.5 flex items-baseline gap-2.5">
  <h2>Ergebnis</h2>
</div>
<div class="mb-4 flex items-center gap-3">
  {#if report.valid}
    <ShieldCheck class="size-6 shrink-0 text-status-ok" />
  {:else}
    <ShieldAlert class="size-6 shrink-0 text-status-bad" />
  {/if}
  <div class="min-w-0">
    <div class="truncate font-bold">{baseName(filePath)}</div>
    <div class="truncate font-mono text-xs text-muted-foreground" title={filePath}>{filePath}</div>
  </div>
  <Badge variant={report.valid ? "paid" : "late"}>{validationVerdictLabel(report.valid)}</Badge>
  <span class="ml-auto text-right text-[13px] text-muted-foreground">
    {report.scenario ?? "Kein Szenario erkannt"}
  </span>
</div>

{#if report.findings.length > 0}
  <table class="data-list">
    <thead>
      <tr>
        <th class="w-28">{report.findings.length} {report.findings.length === 1 ? "Meldung" : "Meldungen"}</th>
        <th class="w-44">Regel</th>
        <th>Meldung</th>
      </tr>
    </thead>
    <tbody>
      <!-- The same rule can fire at several locations, so code and message are no unique key. -->
      {#each report.findings as finding, idx (idx)}
        {@const severity = findingSeverityMeta(finding.severity)}
        <tr>
          <td class="py-3 align-top"><Badge variant={severity.variant}>{severity.label}</Badge></td>
          <td class="py-3 align-top font-mono text-xs break-all text-muted-foreground">{finding.code ?? ""}</td>
          <td class="py-3">
            <div>{finding.message}</div>
            {#if finding.location}
              <div class="font-mono text-xs break-all text-muted-foreground">{finding.location}</div>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{:else}
  <p class="text-[13px] text-muted-foreground">Es gibt keine Meldungen.</p>
{/if}
