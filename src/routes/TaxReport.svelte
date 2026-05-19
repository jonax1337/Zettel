<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "$lib/ui";
  import { ArrowLeft } from "@lucide/svelte";
  import { centsToEur } from "$lib/utils/money";
  import { computeTaxRücklage, type TaxRücklageResult, type TaxScenario } from "$lib/dashboard/tax";
  import { loadDefaultPeriod } from "$lib/dashboard/period";

  // Steuerjahr aus der Dashboard-Periode ableiten — bei Quartal/Monat/Custom
  // wird das Containerjahr genutzt (ESt ist annual).
  const initialYear = new Date(loadDefaultPeriod().start * 1000).getFullYear();
  let year = $state(initialYear);

  let result = $state<TaxRücklageResult | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let mode = $state<"ytd" | "projected">("projected");

  const active: TaxScenario | null = $derived(
    result === null ? null : mode === "ytd" ? result.ytd : result.projected,
  );

  async function reload(y: number) {
    loading = result === null;
    try {
      result = await computeTaxRücklage(y);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    reload(year);
  });
</script>

<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
  <div>
    <a use:link href="/" class="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
      <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
      Dashboard
    </a>
    <h1 class="text-3xl font-semibold tracking-tight">
      Steuer-Rücklage {result?.year ?? year}
    </h1>
    <p class="text-sm text-muted-foreground mt-1.5 max-w-2xl">
      Vorhersage zur Liquiditätsplanung — <strong>keine Steuerberatung</strong>.
      Tarif nach § 32a EStG VZ {active?.income.tarifYear ?? year},
      Konstanten aus amtlicher BMF-Bekanntmachung.
    </p>
  </div>
  <label class="flex items-center gap-2 text-sm">
    <span class="text-muted-foreground">Jahr</span>
    <select
      bind:value={year}
      class="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
    >
      {#each [2024, 2025, 2026, 2027] as y (y)}
        <option value={y}>{y}</option>
      {/each}
    </select>
  </label>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if result && active}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
    <Card
      class={mode === "ytd"
        ? "ring-2 ring-primary cursor-pointer"
        : "cursor-pointer hover:bg-muted/40 transition-colors"}
      onclick={() => (mode = "ytd")}
    >
      <CardHeader>
        <CardTitle>Bisher ausgelöst (YTD)</CardTitle>
        <CardDescription>
          Steuerlast aus dem, was du wirklich bis heute erwirtschaftet hast.
          Konservativ — keine Hochrechnung.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="text-4xl font-semibold tabular-nums">
          {centsToEur(result.ytd.recommendedReserveCent)}
        </div>
        <p class="text-xs text-muted-foreground mt-2">
          aus {centsToEur(result.profitYtdCent)} Gewinn YTD
        </p>
      </CardContent>
    </Card>

    <Card
      class={mode === "projected"
        ? "ring-2 ring-primary cursor-pointer"
        : "cursor-pointer hover:bg-muted/40 transition-colors"}
      onclick={() => (mode = "projected")}
    >
      <CardHeader>
        <CardTitle>Aufs Jahr hochgerechnet</CardTitle>
        <CardDescription>
          Linear extrapoliert — sinnvoll wenn deine YTD-Zahlen ein
          repräsentatives Bild abgeben.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="text-4xl font-semibold tabular-nums">
          {centsToEur(result.projected.recommendedReserveCent)}
        </div>
        <p class="text-xs text-muted-foreground mt-2">
          aus {centsToEur(result.projectedAnnualProfitCent)} Jahres-Prognose
        </p>
      </CardContent>
    </Card>
  </div>

  <Card class="mb-6">
    <CardHeader>
      <CardTitle>Hochrechnung</CardTitle>
      <CardDescription>
        Aus dem YTD-Gewinn linear aufs Jahr extrapoliert.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-3 gap-6">
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Gewinn YTD</div>
          <div class="text-2xl font-semibold tabular-nums mt-1">{centsToEur(result.profitYtdCent)}</div>
          <div class="text-xs text-muted-foreground mt-0.5">Tag {result.daysElapsed} / 365</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">+ noch erwartet</div>
          <div class="text-2xl font-semibold tabular-nums mt-1">
            {centsToEur(result.projectedAnnualProfitCent - result.profitYtdCent)}
          </div>
          <div class="text-xs text-muted-foreground mt-0.5">linear extrapoliert</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">= Jahres-Prognose</div>
          <div class="text-2xl font-semibold tabular-nums mt-1">{centsToEur(result.projectedAnnualProfitCent)}</div>
          <div class="text-xs text-muted-foreground mt-0.5">Basis der Projektion</div>
        </div>
      </div>
    </CardContent>
  </Card>

  {#if result.flags.usePauschal}
    <Card class="mb-6">
      <CardHeader>
        <CardTitle>Detail vs. Pauschal</CardTitle>
        <CardDescription>
          Detailmodus rechnet ESt+Soli+KiSt+GewSt+USt aus dem hochgerechneten Gewinn.
          Pauschalmodus nimmt schlicht {result.flags.pauschalPercent} % vom Brutto-Umsatz YTD.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div class="text-xs text-muted-foreground uppercase tracking-wider">Detail-Rücklage</div>
            <div class="text-2xl font-semibold tabular-nums mt-1">
              {centsToEur(result.projected.recommendedReserveCent)}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">aus dem Tarif (Projektion)</div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground uppercase tracking-wider">
              Pauschal {result.flags.pauschalPercent} %
            </div>
            <div class="text-2xl font-semibold tabular-nums mt-1">
              {centsToEur(result.pauschalReserveCent)}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">
              {result.flags.pauschalPercent} % × {centsToEur(result.revenueYtdGrossCent)} Brutto-Umsatz
            </div>
          </div>
          <div>
            <div class="text-xs text-muted-foreground uppercase tracking-wider">Differenz</div>
            <div class="text-2xl font-semibold tabular-nums mt-1 {result.pauschalDeltaCent >= 0 ? 'text-foreground' : 'text-muted-foreground'}">
              {result.pauschalDeltaCent >= 0 ? "+" : ""}{centsToEur(result.pauschalDeltaCent)}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">
              {#if result.pauschalDeltaCent > 0}
                Detail höher — Pauschal unterschätzt
              {:else if result.pauschalDeltaCent < 0}
                Pauschal höher — du legst zu viel zurück
              {:else}
                identisch
              {/if}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

  <Card class="mb-6">
    <CardHeader>
      <CardTitle>
        Aufschlüsselung — {mode === "ytd" ? "YTD" : "Jahres-Projektion"}
      </CardTitle>
      <CardDescription>
        Basis: {centsToEur(active.profitCent)} {mode === "ytd" ? "Gewinn YTD" : "Jahres-Prognose"}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <table class="w-full text-sm">
        <tbody class="divide-y">
          <tr class="text-base">
            <td class="py-3 font-medium">Einkommensteuer (§ 32a EStG)</td>
            <td class="py-3 text-right tabular-nums">{centsToEur(active.income.est)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">+ Solidaritätszuschlag</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(active.income.soli)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">+ Kirchensteuer</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(active.income.kist)}</td>
          </tr>

          {#if result.flags.isFreelancer}
            <tr>
              <td class="py-3 font-medium">Gewerbesteuer</td>
              <td class="py-3 text-right tabular-nums text-muted-foreground italic">entfällt (Freiberufler)</td>
            </tr>
          {:else}
            <tr>
              <td class="py-3 font-medium">Gewerbesteuer (vor Anrechnung)</td>
              <td class="py-3 text-right tabular-nums">{centsToEur(active.trade.tradeTax)}</td>
            </tr>
            <tr>
              <td class="py-3 pl-6 text-muted-foreground">− Anrechnung auf ESt (§ 35 EStG)</td>
              <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(active.trade.estCredit)}</td>
            </tr>
            <tr>
              <td class="py-3 pl-6 text-muted-foreground">= GewSt-Restbelastung</td>
              <td class="py-3 text-right tabular-nums">{centsToEur(active.gewStNetCent)}</td>
            </tr>
          {/if}

          <tr>
            <td class="py-3 font-medium">Umsatzsteuer-Schuld YTD</td>
            <td class="py-3 text-right tabular-nums">
              {#if result.flags.isKleinunternehmer}
                <span class="text-muted-foreground italic">entfällt (Kleinunternehmer §19)</span>
              {:else}
                {centsToEur(result.ustSchuldYtdCent)}
              {/if}
            </td>
          </tr>

          <tr class="text-base font-medium border-t-2">
            <td class="py-3">Summe Steuer-Last</td>
            <td class="py-3 text-right tabular-nums">{centsToEur(active.totalTaxBurdenCent)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">− geleistete Vorauszahlungen Q1-Q4</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(result.prepaymentsCent)}</td>
          </tr>
          <tr class="text-base font-semibold border-t">
            <td class="py-4">Empfohlene Rücklage</td>
            <td class="py-4 text-right tabular-nums">{centsToEur(active.recommendedReserveCent)}</td>
          </tr>
        </tbody>
      </table>
    </CardContent>
  </Card>

  <div class="text-xs text-muted-foreground space-y-1 max-w-3xl">
    <p>
      <strong>Disclaimer:</strong> Diese Schätzung ist eine Liquiditätshilfe, keine Steuerberatung.
      <strong>YTD-Modus</strong> zeigt die Steuerlast aus dem bisherigen Gewinn — konservativ,
      besonders sinnvoll früh im Jahr oder bei stark schwankenden Einnahmen.
      <strong>Hochrechnungs-Modus</strong> extrapoliert linear aufs Jahr — passend wenn deine
      YTD-Zahlen den Jahresverlauf gut repräsentieren.
    </p>
    <p>
      USt-Schuld-Approximation: Rechnungs-USt minus Vorsteuer aus Eingangsrechnungen.
      Reverse-Charge-Bezüge mit Selbstschuldung sind hier vereinfacht; für die echte UStVA siehe
      <a use:link href="/reports/ustva" class="underline">UStVA-Vorbereitung</a>.
    </p>
    <p>
      Für eine verbindliche Steuererklärung konsultiere deinen Steuerberater. Zettel macht keine ELSTER-Anbindung.
    </p>
  </div>
{/if}
