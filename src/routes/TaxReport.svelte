<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Label } from "$lib/ui";
  import { ArrowLeft, Calculator, Sparkles, Wifi, WifiOff } from "@lucide/svelte";
  import { centsToEur } from "$lib/utils/money";
  import { computeTaxRücklage, type TaxRücklageResult } from "$lib/dashboard/tax";

  let result = $state<TaxRücklageResult | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let overrideEuro = $state<string>("");

  async function reload(overrideCent?: number) {
    loading = true;
    try {
      result = await computeTaxRücklage(
        overrideCent !== undefined ? { remainingProfitOverrideCent: overrideCent } : undefined,
      );
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    reload();
  });

  function applyOverride() {
    const v = overrideEuro.trim().replace(/\./g, "").replace(",", ".");
    const n = Number.parseFloat(v);
    if (Number.isNaN(n)) {
      reload();
      return;
    }
    reload(Math.round(n * 100));
  }

  function resetOverride() {
    overrideEuro = "";
    reload();
  }
</script>

<header class="mb-6">
  <a use:link href="/" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2">
    <ArrowLeft class="size-4" />
    Dashboard
  </a>
  <h1 class="text-3xl font-semibold tracking-tight flex items-center gap-3">
    <Calculator class="size-7 text-muted-foreground" />
    Steuer-Rücklage {result?.year ?? new Date().getFullYear()}
  </h1>
  <p class="text-sm text-muted-foreground mt-1.5 max-w-2xl">
    Vorhersage zur Liquiditätsplanung — <strong>keine Steuerberatung</strong>.
    Tarif {result?.flags.estSource === "bmf" ? "live vom BMF-Lohnsteuerrechner" : "lokale § 32a-Schätzung (VZ 2024 Konstanten)"}.
  </p>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if result}
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
    <Card class="lg:col-span-2">
      <CardHeader>
        <CardTitle>Empfohlene Rücklage</CardTitle>
        <CardDescription>
          Auf Basis der bisherigen YTD-Zahlen, hochgerechnet aufs Jahr.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="text-5xl font-semibold tabular-nums">
          {centsToEur(result.recommendedReserveCent)}
        </div>
        <p class="text-sm text-muted-foreground mt-2">
          {#if result.recommendedReserveCent === 0 && result.totalTaxBurdenCent > 0}
            Vorauszahlungen decken die geschätzte Last bereits vollständig ab.
          {:else if result.totalTaxBurdenCent === 0}
            Bisher keine relevante Steuerlast erwartet.
          {:else}
            Davon ESt + Soli + KiSt: {centsToEur(result.income.total)} ·
            GewSt (netto): {centsToEur(Math.max(0, result.trade.tradeTax - result.trade.estCredit))} ·
            USt: {centsToEur(result.ustSchuldYtdCent)} ·
            abzgl. Vorauszahlungen: {centsToEur(result.prepaymentsCent)}
          {/if}
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Datenquelle</CardTitle>
      </CardHeader>
      <CardContent class="space-y-2">
        <div class="flex items-center gap-2 text-sm">
          {#if result.flags.estSource === "bmf"}
            <Wifi class="size-4 text-success" />
            <span>BMF live ({result.income.year})</span>
          {:else}
            <WifiOff class="size-4 text-muted-foreground" />
            <span>Lokal (Tarif {result.income.year})</span>
          {/if}
        </div>
        <p class="text-xs text-muted-foreground">
          Bei BMF-Erreichbarkeit ziehen wir die ESt aus dem offiziellen Lohnsteuer-Rechner,
          Cache 24 h. Offline-Fallback ist die § 32a-Formel mit eingefrorenen Konstanten.
        </p>
      </CardContent>
    </Card>
  </div>

  <Card class="mb-6">
    <CardHeader>
      <CardTitle>Hochrechnung</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Gewinn YTD</div>
          <div class="text-2xl font-semibold tabular-nums mt-1">{centsToEur(result.profitYtdCent)}</div>
          <div class="text-xs text-muted-foreground mt-0.5">Tag {result.daysElapsed} / 365</div>
        </div>
        <div>
          <div class="text-xs text-muted-foreground uppercase tracking-wider">Jahres-Prognose</div>
          <div class="text-2xl font-semibold tabular-nums mt-1">{centsToEur(result.projectedAnnualProfitCent)}</div>
          <div class="text-xs text-muted-foreground mt-0.5">linear extrapoliert</div>
        </div>
        <div class="col-span-2 md:col-span-2">
          <Label class="text-xs uppercase tracking-wider">Was wenn — Restjahres-Gewinn (€)</Label>
          <div class="flex gap-2 mt-1">
            <input
              type="text"
              inputmode="decimal"
              bind:value={overrideEuro}
              placeholder="z. B. 8.000"
              class="flex-1 h-9 px-3 rounded-md border bg-background text-sm"
            />
            <Button variant="outline" onclick={applyOverride}>
              <Sparkles class="size-4" />
              Neu rechnen
            </Button>
            <Button variant="ghost" onclick={resetOverride}>Reset</Button>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            Override: was vermutest du noch zusätzlich bis Jahresende?
          </p>
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
              {centsToEur(result.recommendedReserveCent)}
            </div>
            <div class="text-xs text-muted-foreground mt-0.5">aus dem Tarif</div>
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
      <CardTitle>Aufschlüsselung</CardTitle>
    </CardHeader>
    <CardContent>
      <table class="w-full text-sm">
        <tbody class="divide-y">
          <tr class="text-base">
            <td class="py-3 font-medium">Einkommensteuer (§ 32a EStG)</td>
            <td class="py-3 text-right tabular-nums">{centsToEur(result.income.est)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">+ Solidaritätszuschlag</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(result.income.soli)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">+ Kirchensteuer</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(result.income.kist)}</td>
          </tr>

          {#if result.flags.isFreelancer}
            <tr>
              <td class="py-3 font-medium">Gewerbesteuer</td>
              <td class="py-3 text-right tabular-nums text-muted-foreground italic">entfällt (Freiberufler)</td>
            </tr>
          {:else}
            <tr>
              <td class="py-3 font-medium">Gewerbesteuer (vor Anrechnung)</td>
              <td class="py-3 text-right tabular-nums">{centsToEur(result.trade.tradeTax)}</td>
            </tr>
            <tr>
              <td class="py-3 pl-6 text-muted-foreground">− Anrechnung auf ESt (§ 35 EStG)</td>
              <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(result.trade.estCredit)}</td>
            </tr>
            <tr>
              <td class="py-3 pl-6 text-muted-foreground">= GewSt-Restbelastung</td>
              <td class="py-3 text-right tabular-nums">{centsToEur(Math.max(0, result.trade.tradeTax - result.trade.estCredit))}</td>
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
            <td class="py-3 text-right tabular-nums">{centsToEur(result.totalTaxBurdenCent)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">− geleistete Vorauszahlungen Q1-Q4</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(result.prepaymentsCent)}</td>
          </tr>
          <tr class="text-base font-semibold border-t">
            <td class="py-4">Empfohlene Rücklage</td>
            <td class="py-4 text-right tabular-nums">{centsToEur(result.recommendedReserveCent)}</td>
          </tr>
        </tbody>
      </table>
    </CardContent>
  </Card>

  <div class="text-xs text-muted-foreground space-y-1 max-w-3xl">
    <p>
      <strong>Disclaimer:</strong> Diese Schätzung ist eine Liquiditätshilfe, keine Steuerberatung.
      Saisonale Schwankungen bleiben unberücksichtigt — die Jahresprognose ist lineare Extrapolation der YTD-Werte.
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
