<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { Button, QueryBoundary, Select, Stat, StatRow, toast } from "$lib/ui";
  import { euerToCsv, EUER_SURPLUS_LABEL, type EuerLine, type EuerReport } from "$lib/reports/euer";
  import { EUER_KZ } from "$lib/reports/euer-form";
  import { buildEuerReport } from "$lib/reports/euer-load";
  import { centsToEur } from "$lib/utils/money";
  import { ChevronRight, Download } from "$lib/brand-icons";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import EmptyLinesToggle from "./parts/reports/EmptyLinesToggle.svelte";
  import { partitionEmptyLines } from "./parts/reports/empty-lines";
  import { isEmptyEuerLine, splitEuerSections } from "./parts/reports/euer-sections";
  import Notice from "./parts/reports/Notice.svelte";
  import ReportsShell from "./parts/reports/ReportsShell.svelte";
  import ReportToolbar from "./parts/reports/ReportToolbar.svelte";
  import { saveTextFileWithDialog } from "./parts/reports/save-text-file";
  import { selectableTaxYears } from "./parts/reports/tax-years";

  const currentYear = new Date().getFullYear();

  let yearStr = $state(String(currentYear));
  let saving = $state(false);
  let showEmptyLines = $state(false);

  const yearItems = $derived(
    selectableTaxYears(currentYear, Number.parseInt(yearStr, 10)).map((y) => ({
      value: String(y),
      label: String(y),
    })),
  );

  const report = createQueryState<EuerReport | null>(null, () =>
    buildEuerReport(Number.parseInt(yearStr, 10)),
  );
  $effect(() => {
    report.reload();
  });

  const lines = $derived(partitionEmptyLines(report.data?.lines ?? [], isEmptyEuerLine, showEmptyLines));
  const sections = $derived(splitEuerSections(lines.lines));

  // The shown report can be the previous year's while a new one loads, or after it failed; never export that.
  const exportable = $derived(
    !report.loading && !report.error && report.data?.year === Number.parseInt(yearStr, 10),
  );

  function lineAmount(kz: string): number {
    return report.data?.lines.find((line) => line.kz === kz)?.amountCent ?? 0;
  }

  function formatAmount(line: EuerLine): string {
    return line.amountCent === null ? "—" : centsToEur(line.amountCent);
  }

  async function onSaveCsv(current: EuerReport) {
    saving = true;
    try {
      const saved = await saveTextFileWithDialog({
        defaultPath: `Zettel_Anlage-EUER_${current.year}.csv`,
        filterName: "CSV",
        extension: "csv",
        content: euerToCsv(current),
      });
      if (saved) toast.success("CSV gespeichert");
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", errorMessage(e));
    } finally {
      saving = false;
    }
  }
</script>

<ReportsShell active="/reports/euer">
  <ReportToolbar>
    <Select class="h-8 w-24 text-[13px]" bind:value={yearStr} items={yearItems} aria-label="Jahr" />
    {#snippet actions()}
      <Button variant="ghost" size="sm" href="/settings/tax" class="group">
        Ausgabenkategorien zuordnen
        <ChevronRight class="transition-transform group-hover:translate-x-0.5" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => report.data && onSaveCsv(report.data)}
        disabled={saving || !exportable}
      >
        <Download />
        {saving ? "Speichere…" : "Als CSV speichern"}
      </Button>
    {/snippet}
  </ReportToolbar>

  <QueryBoundary query={report}>
    {#if report.data}
      {@const current = report.data}
      {#if !current.formYearExact}
        <Notice>Zeilennummern für {current.year} nicht hinterlegt, angezeigt nach Formular {current.formYear}.</Notice>
      {/if}
      {#each current.warnings as warning (warning)}
        <Notice tone="warn">{warning}</Notice>
      {/each}

      <StatRow>
        <Stat label="Betriebseinnahmen" value={centsToEur(lineAmount(EUER_KZ.incomeSum))} />
        <Stat label="Betriebsausgaben" value={centsToEur(lineAmount(EUER_KZ.expenseSum))} />
        <Stat label={current.surplusCent < 0 ? "Fehlbetrag" : "Überschuss"} value={centsToEur(Math.abs(current.surplusCent))} />
      </StatRow>

      <div class="mb-2.5 flex flex-wrap items-baseline gap-x-2.5">
        <h2>Anlage EÜR {current.year}</h2>
        <span class="text-[13px] text-muted-foreground">Zeilen nach dem Formular {current.formYear}</span>
      </div>

      <table class="data-list">
        <thead>
          <tr>
            <th class="w-20">Zeile</th>
            <th class="w-28">Kennzahl</th>
            <th>Bezeichnung</th>
            <th class="text-right">Betrag</th>
          </tr>
        </thead>
        {#each sections as section (section.title)}
          <tbody>
            <tr>
              <td colspan="4" class="pt-3 font-display font-extrabold">{section.title}</td>
            </tr>
            {#each section.lines as line (line.kz)}
              <tr class={line.kind === "sum" ? "font-bold" : ""}>
                <td class="py-3 align-top tabular-nums">{line.line}</td>
                <td class="py-3 align-top text-muted-foreground tabular-nums">{line.kz}</td>
                <td class="py-3">
                  <div>{line.label}</div>
                  {#if line.hint}
                    <div class="text-[13px] font-normal text-muted-foreground">{line.hint}</div>
                  {/if}
                </td>
                <td class="py-3 text-right align-top font-bold whitespace-nowrap tabular-nums">{formatAmount(line)}</td>
              </tr>
            {/each}
          </tbody>
        {/each}
        <tbody>
          <tr class="font-bold">
            <td colspan="3" class="py-3">{EUER_SURPLUS_LABEL}</td>
            <td class="py-3 text-right whitespace-nowrap tabular-nums">{centsToEur(current.surplusCent)}</td>
          </tr>
        </tbody>
      </table>
      <EmptyLinesToggle count={lines.emptyCount} noun={{ singular: "Zeile", plural: "Zeilen" }} bind:open={showEmptyLines} />

      <div class="mt-5 max-w-[78ch] space-y-1.5 text-[13px] text-muted-foreground">
        <p>
          Zettel rechnet aus den erfassten Belegen und ersetzt keine Steuerberatung. Die Werte sind zum Abtippen in
          ELSTER gedacht, einen Upload gibt es nicht. Betriebseinnahmen und -ausgaben zählen nach Zahlungsdatum
          (Zufluss und Abfluss). Leere Zeilen bleiben im Formular leer.
        </p>
        <p>
          AfA, Anlagevermögen, private Nutzung, Zahlungen und Erstattungen der Umsatzsteuer an das Finanzamt und
          Sonderfälle sind nicht enthalten. Stimme die Werte mit deiner Steuerberatung ab.
        </p>
        <p>
          Ob Ausgaben brutto (Kleinunternehmer) oder netto mit Vorsteuer gebucht werden, richtet sich nach der
          aktuellen Einstellung „Kleinunternehmer“, nicht nach dem Rechnungsdatum. Stornorechnungen mindern die
          Einnahmen erst, wenn die Erstattung als Zahlung auf der Stornorechnung erfasst ist.
        </p>
        <p>Der Export ist nur als CSV verfügbar, ein PDF gibt es nicht.</p>
      </div>
    {/if}
  </QueryBoundary>
</ReportsShell>