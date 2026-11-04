<script lang="ts">
  import { untrack } from "svelte";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription, Label, Select } from "$lib/ui";
  import { centsToEur } from "$lib/utils/money";
  import { computeTaxRücklage, type TaxRücklageResult } from "$lib/dashboard/tax";
  import { loadDefaultPeriod } from "$lib/dashboard/period";
  import BackLink from "./parts/entity/BackLink.svelte";
  import Metric from "./parts/reports/Metric.svelte";
  import PauschalComparisonCard from "./parts/reports/PauschalComparisonCard.svelte";
  import ScenarioCard from "./parts/reports/ScenarioCard.svelte";
  import TaxBreakdownCard from "./parts/reports/TaxBreakdownCard.svelte";
  import { selectableTaxYears, taxYearOfPeriod } from "./parts/reports/tax-years";

  const currentYear = new Date().getFullYear();
  let year = $state(taxYearOfPeriod(loadDefaultPeriod()));

  let result = $state<TaxRücklageResult | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let projected = $state(true);
  let latestRequest = 0;

  const yearItems = $derived(
    selectableTaxYears(currentYear, year).map((y) => ({ value: String(y), label: String(y) })),
  );
  const activeScenario = $derived(result && (projected ? result.projected : result.ytd));

  async function reload(selectedYear: number) {
    const request = ++latestRequest;
    loading = result === null;
    try {
      const computed = await computeTaxRücklage(selectedYear);
      if (request !== latestRequest) return;
      result = computed;
      error = null;
    } catch (e) {
      if (request === latestRequest) error = String(e);
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

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <BackLink href="/">Dashboard</BackLink>
    <h1 class="text-3xl font-semibold tracking-tight mt-2">
      Steuer-Rücklage {result?.year ?? year}
    </h1>
    <p class="text-sm text-muted-foreground mt-1.5 max-w-2xl">
      Vorhersage zur Liquiditätsplanung — <strong>keine Steuerberatung</strong>.
      Tarif nach § 32a EStG VZ {activeScenario?.income.tarifYear ?? year},
      Konstanten aus amtlicher BMF-Bekanntmachung.
    </p>
  </div>
  <div class="flex items-center gap-2 text-sm">
    <Label class="text-muted-foreground">Jahr</Label>
    <Select
      bind:value={() => String(year), (v) => (year = Number.parseInt(v, 10))}
      items={yearItems}
    />
  </div>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if result && activeScenario}
  <div class="grid grid-cols-1 @3xl:grid-cols-2 gap-4 mb-6">
    <ScenarioCard
      title="Bisher ausgelöst (YTD)"
      description="Steuerlast aus dem, was du wirklich bis heute erwirtschaftet hast. Konservativ — keine Hochrechnung."
      reserveCents={result.ytd.recommendedReserveCent}
      basis="aus {centsToEur(result.profitYtdCent)} Gewinn YTD"
      selected={!projected}
      onSelect={() => (projected = false)}
    />
    <ScenarioCard
      title="Aufs Jahr hochgerechnet"
      description="Linear extrapoliert — sinnvoll wenn deine YTD-Zahlen ein repräsentatives Bild abgeben."
      reserveCents={result.projected.recommendedReserveCent}
      basis="aus {centsToEur(result.projectedAnnualProfitCent)} Jahres-Prognose"
      selected={projected}
      onSelect={() => (projected = true)}
    />
  </div>

  <Card class="mb-6">
    <CardHeader>
      <CardTitle>Hochrechnung</CardTitle>
      <CardDescription>
        Aus dem YTD-Gewinn linear aufs Jahr extrapoliert.
        {#if result.flags.isKleinunternehmer}
          Ausgaben werden {result.flags.expensesDeductedGross
            ? "brutto abgezogen (steuerlich korrekt ohne Vorsteuerabzug)"
            : "netto abgezogen (konservatives Minimum)"}.
        {/if}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-3 gap-6">
        <Metric
          label="Gewinn YTD"
          value={centsToEur(result.profitYtdCent)}
          caption="Tag {result.daysElapsed} / {result.daysInYear}"
        />
        <Metric
          label="+ noch erwartet"
          value={centsToEur(result.projectedAnnualProfitCent - result.profitYtdCent)}
          caption="linear extrapoliert"
        />
        <Metric
          label="= Jahres-Prognose"
          value={centsToEur(result.projectedAnnualProfitCent)}
          caption="Basis der Projektion"
        />
      </div>
    </CardContent>
  </Card>

  {#if result.flags.usePauschal}
    <PauschalComparisonCard {result} />
  {/if}

  <TaxBreakdownCard {result} scenario={activeScenario} {projected} />
{/if}
