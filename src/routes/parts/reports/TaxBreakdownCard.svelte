<script lang="ts">
  import { link } from "svelte-spa-router";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/ui";
  import { centsToEur } from "$lib/utils/money";
  import type { TaxRücklageResult, TaxScenario } from "$lib/dashboard/tax";

  type Props = {
    result: TaxRücklageResult;
    scenario: TaxScenario;
    projected: boolean;
  };
  let { result, scenario, projected }: Props = $props();
</script>

<Card class="mb-6">
  <CardHeader>
    <CardTitle>
      Aufschlüsselung — {projected ? "Jahres-Projektion" : "YTD"}
    </CardTitle>
    <CardDescription>
      Basis: {centsToEur(scenario.profitCent)} {projected ? "Jahres-Prognose" : "Gewinn YTD"}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <table class="w-full text-sm">
      <tbody class="divide-y">
        <tr class="text-base">
          <td class="py-3 font-medium">Einkommensteuer (§ 32a EStG)</td>
          <td class="py-3 text-right tabular-nums">{centsToEur(scenario.income.est)}</td>
        </tr>
        <tr>
          <td class="py-3 pl-6 text-muted-foreground">+ Solidaritätszuschlag</td>
          <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(scenario.income.soli)}</td>
        </tr>
        <tr>
          <td class="py-3 pl-6 text-muted-foreground">+ Kirchensteuer</td>
          <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(scenario.income.kist)}</td>
        </tr>

        {#if result.flags.isFreelancer}
          <tr>
            <td class="py-3 font-medium">Gewerbesteuer</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground italic">entfällt (Freiberufler)</td>
          </tr>
        {:else}
          <tr>
            <td class="py-3 font-medium">Gewerbesteuer (vor Anrechnung)</td>
            <td class="py-3 text-right tabular-nums">{centsToEur(scenario.trade.tradeTax)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">− Anrechnung auf ESt (§ 35 EStG)</td>
            <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(scenario.trade.estCredit)}</td>
          </tr>
          <tr>
            <td class="py-3 pl-6 text-muted-foreground">= GewSt-Restbelastung</td>
            <td class="py-3 text-right tabular-nums">{centsToEur(scenario.gewStNetCent)}</td>
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
          <td class="py-3 text-right tabular-nums">{centsToEur(scenario.totalTaxBurdenCent)}</td>
        </tr>
        <tr>
          <td class="py-3 pl-6 text-muted-foreground">− geleistete Vorauszahlungen Q1-Q4</td>
          <td class="py-3 text-right tabular-nums text-muted-foreground">{centsToEur(result.prepaymentsCent)}</td>
        </tr>
        <tr class="text-base font-semibold border-t">
          <td class="py-4">Empfohlene Rücklage</td>
          <td class="py-4 text-right tabular-nums">{centsToEur(scenario.recommendedReserveCent)}</td>
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
