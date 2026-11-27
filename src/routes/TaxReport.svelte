<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { untrack } from "svelte";
  import { link } from "svelte-spa-router";
  import { Segmented, Select, Stat, StatRow } from "$lib/ui";
  import { centsToEur } from "$lib/utils/money";
  import { computeTaxRücklage, type TaxRücklageResult } from "$lib/dashboard/tax";
  import { loadDefaultPeriod } from "$lib/dashboard/period";
  import PauschalComparison from "./parts/reports/PauschalComparison.svelte";
  import ReportsShell from "./parts/reports/ReportsShell.svelte";
  import ReportToolbar from "./parts/reports/ReportToolbar.svelte";
  import ReserveBreakdown from "./parts/reports/ReserveBreakdown.svelte";
  import ReserveHero from "./parts/reports/ReserveHero.svelte";
  import {
    DEFAULT_RESERVE_VIEW,
    RESERVE_VIEW_DESCRIPTIONS,
    RESERVE_VIEW_ITEMS,
    type ReserveView,
  } from "./parts/reports/reserve-summary";
  import { selectableTaxYears, taxYearOfPeriod } from "./parts/reports/tax-years";

  const currentYear = new Date().getFullYear();
  let year = $state(taxYearOfPeriod(loadDefaultPeriod()));

  let result = $state<TaxRücklageResult | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let view = $state<ReserveView>(DEFAULT_RESERVE_VIEW);
  let latestRequest = 0;

  const yearItems = $derived(
    selectableTaxYears(currentYear, year).map((y) => ({ value: String(y), label: String(y) })),
  );
  const activeScenario = $derived(result && result[view]);

  async function reload(selectedYear: number) {
    const request = ++latestRequest;
    loading = result === null;
    try {
      const computed = await computeTaxRücklage(selectedYear);
      if (request !== latestRequest) return;
      result = computed;
      error = null;
    } catch (e) {
      if (request === latestRequest) error = errorMessage(e);
    } finally {
      if (request === latestRequest) loading = false;
    }
  }

  // reload() reads `result` to decide whether to show the spinner; tracking that would reload on every result.
  $effect(() => {
    const selectedYear = year;
    untrack(() => reload(selectedYear));
  });
</script>

<ReportsShell active="/reports/taxes">
  <ReportToolbar>
    <Select
      class="h-8 w-24 text-[13px]"
      bind:value={() => String(year), (v) => (year = Number.parseInt(v, 10))}
      items={yearItems}
      aria-label="Jahr"
    />
    <Segmented bind:value={view} items={RESERVE_VIEW_ITEMS} ariaLabel="Berechnungsstand" />
  </ReportToolbar>

  {#if loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if error}
    <p class="text-sm text-destructive">Fehler: {error}</p>
  {:else if result && activeScenario}
    <p class="mb-4 max-w-[78ch] text-[13px] text-muted-foreground">{RESERVE_VIEW_DESCRIPTIONS[view]}</p>

    <StatRow>
      <Stat label="Gewinn bis heute" value={centsToEur(result.profitYtdCent)} hint="Tag {result.daysElapsed} von {result.daysInYear}" />
      <Stat
        label="Noch erwartet"
        value={centsToEur(result.projectedAnnualProfitCent - result.profitYtdCent)}
        hint="linear hochgerechnet"
      />
      <Stat label="Jahres-Prognose" value={centsToEur(result.projectedAnnualProfitCent)} hint="Basis der Hochrechnung" />
    </StatRow>
    {#if result.flags.isKleinunternehmer}
      <p class="-mt-3 mb-5 text-[13px] text-muted-foreground">
        Ausgaben werden {result.flags.expensesDeductedGross
          ? "brutto abgezogen (steuerlich korrekt ohne Vorsteuerabzug)"
          : "netto abgezogen (konservatives Minimum)"}.
      </p>
    {/if}

    <div class="mb-8 grid grid-cols-1 items-start gap-6 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ReserveHero {result} scenario={activeScenario} />
      <div>
        <ReserveBreakdown {result} scenario={activeScenario} {view} />
      </div>
    </div>

    {#if result.flags.usePauschal}
      <div class="mb-8">
        <PauschalComparison {result} />
      </div>
    {/if}

    <div class="max-w-[78ch] space-y-1.5 text-[13px] text-muted-foreground">
      <p>
        Das ist eine Vorhersage zur Liquiditätsplanung und keine Steuerberatung. Der Tarif folgt § 32a EStG für
        {activeScenario.income.tarifYear}, die Konstanten stammen aus der amtlichen BMF-Bekanntmachung. Grundlage ist
        dein Steuerprofil in den Einstellungen.
      </p>
      <p>
        Die Umsatzsteuer-Schuld ist angenähert als Umsatzsteuer aus Rechnungen minus Vorsteuer aus Ausgaben.
        Reverse-Charge-Bezüge mit Selbstschuldung sind hier vereinfacht; für die echte Voranmeldung siehe
        <a href="/reports/ustva" use:link class="underline underline-offset-2 hover:text-foreground">UStVA</a>.
      </p>
      <p>Für eine verbindliche Steuererklärung wende dich an deine Steuerberatung. Zettel hat keine ELSTER-Anbindung.</p>
    </div>
  {/if}
</ReportsShell>