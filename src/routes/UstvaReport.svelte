<script lang="ts">
  import { save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Label,
    Select,
    toast,
  } from "$lib/ui";
  import {
    buildUstvaReport,
    ustvaToCsv,
    type Quarter,
    type UstvaReport,
  } from "$lib/reports/ustva";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { Download, AlertTriangle } from "@lucide/svelte";

  const currentYear = new Date().getFullYear();
  const currentQuarter = (Math.floor(new Date().getMonth() / 3) + 1) as Quarter;

  let yearStr = $state(String(currentYear));
  let quarterStr = $state(String(currentQuarter));
  let report = $state<UstvaReport | null>(null);
  let loading = $state(false);
  let saving = $state(false);

  const yearItems = $derived(
    [currentYear, currentYear - 1, currentYear - 2].map((y) => ({
      value: String(y),
      label: String(y),
    })),
  );
  const quarterItems = [
    { value: "1", label: "Q1 (Jan–Mär)" },
    { value: "2", label: "Q2 (Apr–Jun)" },
    { value: "3", label: "Q3 (Jul–Sep)" },
    { value: "4", label: "Q4 (Okt–Dez)" },
  ];

  async function reload() {
    loading = true;
    try {
      const y = Number.parseInt(yearStr, 10);
      const q = Number.parseInt(quarterStr, 10) as Quarter;
      report = await buildUstvaReport(y, q);
    } catch (e) {
      toast.error("Bericht konnte nicht erzeugt werden", String(e));
      report = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void yearStr;
    void quarterStr;
    reload();
  });

  async function onSaveCsv() {
    if (!report) return;
    saving = true;
    try {
      const filename = `UStVA-${report.year}-Q${report.quarter}.csv`;
      const targetPath = await save({
        defaultPath: filename,
        filters: [{ name: "CSV", extensions: ["csv"] }],
      });
      if (!targetPath) return;
      await invoke<string>("save_text_file", {
        path: targetPath,
        content: ustvaToCsv(report),
      });
      toast.success("CSV gespeichert");
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">UStVA-Vorbereitung</h1>
  <p class="text-sm text-muted-foreground mt-1">
    Quartalsweise Aggregation der wichtigsten Kennzahlen für die Umsatzsteuer-Voranmeldung.
    Werte zum Abtippen in ELSTER — kein direkter Upload.
  </p>
</header>

<div class="mb-6 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-3">
  <AlertTriangle class="size-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
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

{#if loading}
  <p class="text-sm text-muted-foreground">Berechne…</p>
{:else if report}
  <Card>
    <CardHeader>
      <CardTitle>
        Q{report.quarter}/{report.year}
      </CardTitle>
      <CardDescription>
        Zeitraum {formatDate(report.dateFrom)} – {formatDate(report.dateTo)}
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
          {#each report.rows as row (row.kz)}
            <tr class="border-t">
              <td class="px-4 py-3 font-mono font-medium">{row.kz}</td>
              <td class="px-4 py-3">
                <div>{row.label}</div>
                <div class="text-xs text-muted-foreground mt-0.5">{row.computedFrom}</div>
              </td>
              <td class="px-4 py-3 text-right font-mono tabular-nums">
                {centsToEur(row.amount)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </CardContent>
  </Card>

  <div class="mt-6">
    <Button onclick={onSaveCsv} disabled={saving}>
      <Download class="size-4" />
      {saving ? "Speichere…" : "CSV exportieren"}
    </Button>
  </div>
{/if}
