<script lang="ts">
  import { Button, QueryBoundary, Select, Stat, StatRow, toast } from "$lib/ui";
  import {
    buildUstvaReport,
    formatUstvaAmount,
    summarizeUstva,
    ustvaToCsv,
    VAT_ACCOUNTING_LABELS,
    type Quarter,
    type UstvaReport,
    type UstvaSummary,
  } from "$lib/reports/ustva";
  import { loadSettings } from "$lib/db/queries";
  import { formatDate, nowUnix } from "$lib/utils/date";
  import { centsToEur } from "$lib/utils/money";
  import { Download } from "$lib/brand-icons";
  import { link } from "svelte-spa-router";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import EmptyLinesToggle from "./parts/reports/EmptyLinesToggle.svelte";
  import { partitionEmptyLines } from "./parts/reports/empty-lines";
  import Notice from "./parts/reports/Notice.svelte";
  import ReportsShell from "./parts/reports/ReportsShell.svelte";
  import ReportToolbar from "./parts/reports/ReportToolbar.svelte";
  import { saveTextFileWithDialog } from "./parts/reports/save-text-file";
  import { isEmptyUstvaRow, isUstvaQuarterRunning, payableLabel } from "./parts/reports/ustva-view";

  const SELECTABLE_YEARS = 3;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  let yearStr = $state(String(currentYear));
  let quarterStr = $state(String(currentQuarter));
  let saving = $state(false);
  let showEmptyRows = $state(false);

  const yearItems = Array.from({ length: SELECTABLE_YEARS }, (_, i) => {
    const year = String(currentYear - i);
    return { value: year, label: year };
  });
  const quarterItems = [
    { value: "1", label: "Q1 (Jan–Mär)" },
    { value: "2", label: "Q2 (Apr–Jun)" },
    { value: "3", label: "Q3 (Jul–Sep)" },
    { value: "4", label: "Q4 (Okt–Dez)" },
  ];

  const ustva = createQueryState<{ report: UstvaReport; summary: UstvaSummary } | null>(null, async () => {
    const year = Number.parseInt(yearStr, 10);
    const quarter = Number.parseInt(quarterStr, 10) as Quarter;
    const { vatAccounting, isKleinunternehmer } = await loadSettings();
    const report = await buildUstvaReport(year, quarter, vatAccounting);
    return { report, summary: summarizeUstva(report, isKleinunternehmer) };
  });
  $effect(() => {
    ustva.reload();
  });

  const rows = $derived(partitionEmptyLines(ustva.data?.report.rows ?? [], isEmptyUstvaRow, showEmptyRows));

  // The shown report can be the previous period's while a new one loads, or after it failed; never export that.
  const exportable = $derived(
    !ustva.loading &&
      !ustva.error &&
      ustva.data?.report.year === Number.parseInt(yearStr, 10) &&
      ustva.data.report.quarter === Number.parseInt(quarterStr, 10),
  );

  async function onSaveCsv(current: UstvaReport) {
    saving = true;
    try {
      const saved = await saveTextFileWithDialog({
        defaultPath: `UStVA-${current.year}-Q${current.quarter}.csv`,
        filterName: "CSV",
        extension: "csv",
        content: ustvaToCsv(current),
      });
      if (saved) toast.success("CSV gespeichert");
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<ReportsShell active="/reports/ustva">
  <ReportToolbar>
    <Select class="h-8 w-24 text-[13px]" bind:value={yearStr} items={yearItems} aria-label="Jahr" />
    <Select class="h-8 w-44 text-[13px]" bind:value={quarterStr} items={quarterItems} aria-label="Quartal" />
    {#snippet actions()}
      <Button
        variant="outline"
        size="sm"
        onclick={() => ustva.data && onSaveCsv(ustva.data.report)}
        disabled={saving || !exportable}
      >
        <Download />
        {saving ? "Speichere…" : "Als CSV speichern"}
      </Button>
    {/snippet}
  </ReportToolbar>

  <QueryBoundary query={ustva}>
    {#if ustva.data}
      {@const { report, summary } = ustva.data}
      {@const running = isUstvaQuarterRunning(report, nowUnix())}
      {#if summary.kind === "computed"}
        <StatRow>
          <Stat label="Umsatzsteuer" value={centsToEur(summary.outputVatCent)} hint="aus KZ 81 und 86" />
          <Stat label="Abziehbare Vorsteuer" value={centsToEur(summary.inputVatCent)} hint="KZ 66" />
          <Stat
            label={payableLabel(summary.payableCent, running)}
            value={centsToEur(Math.abs(summary.payableCent))}
            hint="ohne § 13b-Fälle"
          />
        </StatRow>
      {:else}
        <Notice>
          Als Kleinunternehmer (§ 19 UStG) schuldest du keine Umsatzsteuer und kannst keine Vorsteuer abziehen.
          Umsatzsteuer, Vorsteuer und Zahllast entfallen deshalb.
        </Notice>
      {/if}

      <div class="mb-2.5 flex flex-wrap items-baseline gap-x-2.5">
        <h2>Q{report.quarter}/{report.year}</h2>
        <span class="text-[13px] text-muted-foreground">
          Zeitraum {formatDate(report.dateFrom)} – {formatDate(report.dateTo)}
          · {VAT_ACCOUNTING_LABELS[report.vatAccounting]}
        </span>
      </div>

      <table class="data-list">
        <thead>
          <tr>
            <th class="w-24">Kennzahl</th>
            <th>Beschreibung</th>
            <th class="text-right">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {#each rows.lines as row (row.kz)}
            <tr>
              <td class="py-3 align-top font-bold tabular-nums">{row.kz}</td>
              <td class="py-3">
                <div>{row.label}</div>
                <div class="text-[13px] text-muted-foreground">{row.computedFrom}</div>
              </td>
              <td class="py-3 text-right align-top font-bold whitespace-nowrap tabular-nums">{formatUstvaAmount(row)}</td>
            </tr>
          {:else}
            <tr>
              <td colspan="3" class="text-muted-foreground">Für diesen Zeitraum gibt es keine Beträge.</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <EmptyLinesToggle count={rows.emptyCount} noun={{ singular: "Kennzahl", plural: "Kennzahlen" }} bind:open={showEmptyRows} />

      <div class="mt-5 max-w-[78ch] space-y-1.5 text-[13px] text-muted-foreground">
        <p>
          Zettel rechnet aus den erfassten Belegen und ersetzt keine Steuerberatung. Die Werte sind zum Abtippen in
          ELSTER gedacht, einen Upload gibt es nicht. Bemessungsgrundlagen sind wie in ELSTER auf volle Euro
          abgeschnitten, Steuerbeträge mit Cent.
        </p>
        <p>
          AfA, Privatentnahmen, Sonderfälle und Korrekturen aus Vorquartalen sind nicht enthalten, ebenso eine
          Sondervorauszahlung (Kennzahl 39). Lass die Werte vor der Abgabe in ELSTER von deiner Steuerberatung prüfen.
        </p>
        <p>
          Was du für die Steuer beiseitelegen solltest, siehst du unter
          <a href="/reports/taxes" use:link class="underline underline-offset-2 hover:text-foreground">Steuer-Rücklage</a>.
        </p>
      </div>
    {/if}
  </QueryBoundary>
</ReportsShell>