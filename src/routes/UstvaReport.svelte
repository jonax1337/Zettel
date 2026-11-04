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
  import {
    buildUstvaReport,
    formatUstvaAmount,
    ustvaToCsv,
    VAT_ACCOUNTING_LABELS,
    type Quarter,
    type UstvaReport,
  } from "$lib/reports/ustva";
  import { loadSettings } from "$lib/db/queries";
  import { formatDate } from "$lib/utils/date";
  import { Download, AlertTriangle } from "$lib/brand-icons";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import { saveTextFileWithDialog } from "./parts/reports/save-text-file";

  const SELECTABLE_YEARS = 3;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  let yearStr = $state(String(currentYear));
  let quarterStr = $state(String(currentQuarter));
  let saving = $state(false);

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

  const report = createQueryState<UstvaReport | null>(null, async () => {
    const year = Number.parseInt(yearStr, 10);
    const quarter = Number.parseInt(quarterStr, 10) as Quarter;
    const { vatAccounting } = await loadSettings();
    return buildUstvaReport(year, quarter, vatAccounting);
  });
  $effect(() => {
    report.reload();
  });

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

<PageHeader
  title="UStVA-Vorbereitung"
  subtitle="Quartalsweise Aggregation der wichtigsten Kennzahlen für die Umsatzsteuer-Voranmeldung. Werte zum Abtippen in ELSTER — kein direkter Upload. Bemessungsgrundlagen sind wie in ELSTER auf volle Euro abgeschnitten, Steuerbeträge mit Cent."
/>

<div class="mb-6 rounded-md border border-warning/40 bg-warning/5 p-3 flex items-start gap-3">
  <AlertTriangle class="size-5 text-warning shrink-0 mt-0.5" />
  <div class="text-sm space-y-1">
    <p class="font-medium">Keine Steuerberatung.</p>
    <p class="text-muted-foreground">
      Die Werte basieren auf den erfassten Belegen. AfA, Privatentnahmen, Sonderfälle
      und Korrekturen aus Vorquartalen sind nicht enthalten. Vor ELSTER-Abgabe immer
      vom Steuerberater prüfen lassen.
    </p>
  </div>
</div>

<div class="grid grid-cols-2 gap-4 mb-6 max-w-md">
  <div class="flex flex-col gap-1.5">
    <Label>Jahr</Label>
    <Select bind:value={yearStr} items={yearItems} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label>Quartal</Label>
    <Select bind:value={quarterStr} items={quarterItems} />
  </div>
</div>

{#if report.error}
  <p class="text-sm text-destructive">Bericht konnte nicht erzeugt werden: {report.error}</p>
{:else if report.loading}
  <p class="text-sm text-muted-foreground">Berechne…</p>
{:else if report.data}
  <Card>
    <CardHeader>
      <CardTitle>
        Q{report.data.quarter}/{report.data.year}
      </CardTitle>
      <CardDescription>
        Zeitraum {formatDate(report.data.dateFrom)} – {formatDate(report.data.dateTo)}
        · {VAT_ACCOUNTING_LABELS[report.data.vatAccounting]}
      </CardDescription>
    </CardHeader>
    <CardContent class="p-0">
      <table class="w-full text-sm">
        <thead class="bg-muted/40 text-left">
          <tr class="text-xs uppercase tracking-wider text-muted-foreground">
            <th class="px-4 py-3 font-medium w-20">Kennzahl</th>
            <th class="px-4 py-3 font-medium">Beschreibung</th>
            <th class="px-4 py-3 font-medium text-right w-40">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {#each report.data.rows as row (row.kz)}
            <tr class="border-t">
              <td class="px-4 py-3 font-mono font-medium">{row.kz}</td>
              <td class="px-4 py-3">
                <div>{row.label}</div>
                <div class="text-xs text-muted-foreground mt-0.5">{row.computedFrom}</div>
              </td>
              <td class="px-4 py-3 text-right font-mono tabular-nums">
                {formatUstvaAmount(row)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </CardContent>
  </Card>

  <div class="mt-6">
    <Button onclick={() => onSaveCsv(report.data!)} disabled={saving}>
      <Download class="size-4" />
      {saving ? "Speichere…" : "CSV exportieren"}
    </Button>
  </div>
{/if}
