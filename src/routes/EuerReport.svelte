<script lang="ts">
  import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Label,
    Select,
    PageHeader,
    toast,
  } from "$lib/ui";
  import { euerToCsv, EUER_SURPLUS_LABEL, type EuerLine, type EuerReport } from "$lib/reports/euer";
  import { EUER_KZ } from "$lib/reports/euer-form";
  import { buildEuerReport } from "$lib/reports/euer-load";
  import { centsToEur } from "$lib/utils/money";
  import { Download, AlertTriangle, ArrowRight, Info } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import { saveTextFileWithDialog } from "./parts/reports/save-text-file";
  import { selectableTaxYears } from "./parts/reports/tax-years";

  const currentYear = new Date().getFullYear();

  let yearStr = $state(String(currentYear));
  let saving = $state(false);

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

  const sections = $derived.by(() => {
    const lines = report.data?.lines ?? [];
    const incomeEnd = lines.findIndex((line) => line.kz === EUER_KZ.incomeSum) + 1;
    return [
      { title: "Betriebseinnahmen", lines: lines.slice(0, incomeEnd) },
      { title: "Betriebsausgaben", lines: lines.slice(incomeEnd) },
    ];
  });

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
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<PageHeader
  title="Anlage EÜR"
  subtitle="Betriebseinnahmen und Betriebsausgaben des Jahres nach Zahlungsdatum, sortiert nach den Zeilen des amtlichen Vordrucks. Werte zum Abtippen in ELSTER — kein direkter Upload."
>
  {#snippet back()}
    <BackLink href="/">Dashboard</BackLink>
  {/snippet}
  {#snippet actions()}
    <Button href="/settings/documents" variant="outline" size="sm">
      Zuordnung der Ausgabenkategorien anpassen
      <ArrowRight class="size-4" />
    </Button>
  {/snippet}
</PageHeader>

<div class="mb-6 rounded-md border border-warning/40 bg-warning/5 p-3 flex items-start gap-3">
  <AlertTriangle class="size-5 text-warning shrink-0 mt-0.5" />
  <div class="text-sm space-y-1">
    <p class="font-medium">Keine Steuerberatung.</p>
    <p class="text-muted-foreground">
      Werte nach Zahlungsdatum (Zufluss/Abfluss) aus den erfassten Belegen, zum Abtippen in ELSTER.
      AfA, Anlagevermögen, private Nutzung, USt-Zahlungen/-Erstattungen ans Finanzamt und Sonderfälle
      sind nicht enthalten. Mit dem Steuerberater abstimmen.
    </p>
    <p class="text-muted-foreground">
      Ob Ausgaben brutto (Kleinunternehmer) oder netto mit Vorsteuer gebucht werden, richtet sich nach
      der aktuellen Einstellung „Kleinunternehmer“, nicht nach dem Rechnungsdatum. Stornorechnungen
      mindern die Einnahmen erst, wenn die Erstattung als Zahlung auf der Stornorechnung erfasst ist.
    </p>
  </div>
</div>

<div class="mb-6 max-w-40">
  <div class="flex flex-col gap-1.5">
    <Label>Jahr</Label>
    <Select bind:value={yearStr} items={yearItems} />
  </div>
</div>

{#if report.error}
  <p class="text-sm text-destructive">Bericht konnte nicht erzeugt werden: {report.error}</p>
{:else if report.loading}
  <p class="text-sm text-muted-foreground">Berechne…</p>
{:else if report.data}
  {@const current = report.data}
  {#if !current.formYearExact}
    <div class="mb-4 rounded-md border border-border bg-muted/40 p-3 flex items-start gap-3">
      <Info class="size-5 text-muted-foreground shrink-0 mt-0.5" />
      <p class="text-sm text-muted-foreground">
        Zeilennummern für {current.year} nicht hinterlegt, angezeigt nach Formular {current.formYear}.
      </p>
    </div>
  {/if}
  {#each current.warnings as warning (warning)}
    <div class="mb-4 rounded-md border border-warning/40 bg-warning/5 p-3 flex items-start gap-3">
      <AlertTriangle class="size-5 text-warning shrink-0 mt-0.5" />
      <p class="text-sm">{warning}</p>
    </div>
  {/each}

  <Card>
    <CardHeader>
      <CardTitle>Anlage EÜR {current.year}</CardTitle>
      <CardDescription>
        Zeilen nach dem Formular {current.formYear}. Leere Zeilen („—“) bleiben im Formular leer.
      </CardDescription>
    </CardHeader>
    <CardContent class="p-0">
      <table class="w-full text-sm">
        <thead class="bg-muted/40 text-left">
          <tr class="text-xs uppercase tracking-wider text-muted-foreground">
            <th class="px-4 py-3 font-medium w-20">Zeile</th>
            <th class="px-4 py-3 font-medium w-28">Kz</th>
            <th class="px-4 py-3 font-medium">Bezeichnung</th>
            <th class="px-4 py-3 font-medium text-right w-40">Betrag</th>
          </tr>
        </thead>
        {#each sections as section (section.title)}
          <tbody>
            <tr class="border-t bg-muted/20">
              <th colspan="4" class="px-4 py-2 text-left text-xs uppercase tracking-wider font-semibold">
                {section.title}
              </th>
            </tr>
            {#each section.lines as line (line.kz)}
              <tr class="border-t {line.kind === 'sum' ? 'font-semibold bg-muted/10' : ''}">
                <td class="px-4 py-3 font-mono">{line.line}</td>
                <td class="px-4 py-3 font-mono">{line.kz}</td>
                <td class="px-4 py-3">
                  <div>{line.label}</div>
                  {#if line.hint}
                    <div class="text-xs text-muted-foreground mt-0.5">{line.hint}</div>
                  {/if}
                </td>
                <td class="px-4 py-3 text-right font-mono tabular-nums">{formatAmount(line)}</td>
              </tr>
            {/each}
          </tbody>
        {/each}
        <tfoot>
          <tr class="border-t-2 font-semibold">
            <td class="px-4 py-3" colspan="3">{EUER_SURPLUS_LABEL}</td>
            <td class="px-4 py-3 text-right font-mono tabular-nums">{centsToEur(current.surplusCent)}</td>
          </tr>
        </tfoot>
      </table>
    </CardContent>
  </Card>

  <div class="mt-6 flex flex-wrap items-center gap-3">
    <Button onclick={() => onSaveCsv(current)} disabled={saving}>
      <Download class="size-4" />
      {saving ? "Speichere…" : "CSV exportieren"}
    </Button>
    <p class="text-sm text-muted-foreground">Der Export ist nur als CSV verfügbar, ein PDF gibt es nicht.</p>
  </div>
{/if}
