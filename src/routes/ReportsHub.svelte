<script lang="ts">
  import { link } from "svelte-spa-router";
  import { ChevronRight } from "$lib/brand-icons";
  import { REPORT_PAGES } from "$lib/navigation";
  import { loadSettings } from "$lib/db/queries";
  import { computeTaxRücklage, type TaxRücklageResult } from "$lib/dashboard/tax";
  import { loadDefaultPeriod } from "$lib/dashboard/period";
  import { buildEuerReport } from "$lib/reports/euer-load";
  import type { EuerReport } from "$lib/reports/euer";
  import { buildUstvaReport, summarizeUstva, type Quarter, type UstvaReport, type UstvaSummary } from "$lib/reports/ustva";
  import { nowUnix } from "$lib/utils/date";
  import { createQueryState } from "./parts/entity/query-state.svelte";
  import { euerFigure, reserveFigure, ustvaFigure, type ReportFigure } from "./parts/reports/hub-figures";
  import Notice from "./parts/reports/Notice.svelte";
  import { lastExportLabel, loadLastDatevExport } from "./parts/reports/last-export";
  import { REPORT_TABS } from "./parts/reports/report-tabs";
  import ReportsShell from "./parts/reports/ReportsShell.svelte";
  import { DEFAULT_RESERVE_VIEW } from "./parts/reports/reserve-summary";
  import { taxYearOfPeriod } from "./parts/reports/tax-years";

  type FigureState = { figure: ReportFigure } | { error: string } | null;

  const now = new Date();
  const year = now.getFullYear();
  const quarter = (Math.floor(now.getMonth() / 3) + 1) as Quarter;

  const ustva = createQueryState<{ report: UstvaReport; summary: UstvaSummary } | null>(null, async () => {
    const { vatAccounting, isKleinunternehmer } = await loadSettings();
    const report = await buildUstvaReport(year, quarter, vatAccounting);
    return { report, summary: summarizeUstva(report, isKleinunternehmer) };
  });
  const euer = createQueryState<EuerReport | null>(null, () => buildEuerReport(year));
  const reserve = createQueryState<TaxRücklageResult | null>(null, () =>
    computeTaxRücklage(taxYearOfPeriod(loadDefaultPeriod())),
  );
  const DATEV_HREF = "/export";
  const lastDatevExport = createQueryState<number | null>(null, loadLastDatevExport);
  $effect(() => {
    lastDatevExport.reload();
    ustva.reload();
    euer.reload();
    reserve.reload();
  });

  function figureState<T>(query: { data: T | null; error: string | null }, build: (data: T) => ReportFigure): FigureState {
    if (query.error) return { error: query.error };
    return query.data ? { figure: build(query.data) } : null;
  }

  // Only the three tax reports have a figure that existing functions deliver; DATEV shows when it last ran.
  const figures = $derived<Record<string, FigureState>>({
    "/reports/ustva": figureState(ustva, ({ report, summary }) => ustvaFigure(report, summary, nowUnix())),
    "/reports/euer": figureState(euer, euerFigure),
    "/reports/taxes": figureState(reserve, (result) => reserveFigure(result, DEFAULT_RESERVE_VIEW)),
  });

  const rows = REPORT_PAGES.map((page) => ({
    ...page,
    name: REPORT_TABS.find((tab) => tab.href === page.href)?.label ?? page.label,
  }));
</script>

<ReportsShell active="/reports">
  <Notice>
    Zettel rechnet aus deinen erfassten Belegen und ersetzt keine Steuerberatung. Die Werte sind zum Abtippen in ELSTER
    gedacht, einen Upload gibt es nicht.
  </Notice>

  <ul class="border-t border-line-strong">
    {#each rows as row (row.href)}
      {@const state = figures[row.href]}
      <li class="border-b">
        <a
          href={row.href}
          use:link
          class="group grid min-h-[68px] grid-cols-[28px_minmax(0,1fr)_auto_20px] items-center gap-3.5 px-1 py-2.5 transition-colors hover:bg-surface"
        >
          <row.icon class="size-6 text-muted-foreground" />
          <span class="min-w-0">
            <b class="block font-display text-[15px] font-extrabold">{row.name}</b>
            <span class="block text-[13px] text-muted-foreground">{row.description}</span>
          </span>
          <span class="text-right">
            {#if state && "figure" in state}
              <b class="block font-bold tabular-nums">{state.figure.value}</b>
              <span class="block text-[13px] text-muted-foreground">{state.figure.caption}</span>
            {:else if row.href === DATEV_HREF && lastDatevExport.data}
              <span class="block text-[13px] text-muted-foreground">{lastExportLabel(lastDatevExport.data)}</span>
            {:else if state && "error" in state}
              <b class="block font-bold">Nicht berechenbar</b>
              <span class="ml-auto block max-w-72 truncate text-[13px] text-muted-foreground" title={state.error}>
                {state.error}
              </span>
            {/if}
          </span>
          <ChevronRight class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </a>
      </li>
    {/each}
  </ul>
</ReportsShell>