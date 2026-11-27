<script lang="ts">
  import { centsToEur } from "$lib/utils/money";
  import type { TaxRücklageResult, TaxScenario } from "$lib/dashboard/tax";
  import { prepaymentStatus, type ReserveView } from "./reserve-summary";

  type Props = {
    result: TaxRücklageResult;
    scenario: TaxScenario;
    view: ReserveView;
  };

  let { result, scenario, view }: Props = $props();

  // Deductions are shown with a minus; "|| 0" keeps zero from printing as "-0,00 €".
  const deduction = (cents: number) => -cents || 0;

  const profitCent = $derived(view === "projected" ? result.projectedAnnualProfitCent : result.profitYtdCent);
  const prepayments = $derived(prepaymentStatus(scenario.totalTaxBurdenCent, result.prepaymentsCent));
</script>

<div class="mb-2.5 flex items-baseline gap-2.5">
  <h2>So setzt sich das zusammen</h2>
</div>

<table class="data-list">
  <tbody>
    <tr>
      <td>{`Gewinn ${result.year}, ${view === "projected" ? "aufs Jahr hochgerechnet" : "bis heute"}`}</td>
      <td class="text-right font-bold tabular-nums">{centsToEur(profitCent)}</td>
    </tr>
    {#if profitCent !== scenario.profitCent}
      <tr>
        <td>Angesetzt für die Steuer, ein Verlust zählt als 0 €</td>
        <td class="text-right font-bold tabular-nums">{centsToEur(scenario.profitCent)}</td>
      </tr>
    {/if}
    <tr>
      <td>Einkommensteuer nach Tarif {scenario.income.tarifYear} (§ 32a EStG)</td>
      <td class="text-right font-bold tabular-nums">{centsToEur(scenario.income.est)}</td>
    </tr>
    <tr>
      <td>Solidaritätszuschlag</td>
      <td class="text-right tabular-nums">{centsToEur(scenario.income.soli)}</td>
    </tr>
    <tr>
      <td>Kirchensteuer</td>
      <td class="text-right tabular-nums">{centsToEur(scenario.income.kist)}</td>
    </tr>

    {#if result.flags.isFreelancer}
      <tr>
        <td>Gewerbesteuer</td>
        <td class="text-right whitespace-nowrap text-muted-foreground">entfällt, freier Beruf</td>
      </tr>
    {:else}
      <tr>
        <td>Gewerbesteuer vor Anrechnung</td>
        <td class="text-right tabular-nums">{centsToEur(scenario.trade.tradeTax)}</td>
      </tr>
      <tr>
        <td>Anrechnung auf die Einkommensteuer (§ 35 EStG)</td>
        <td class="text-right tabular-nums">{centsToEur(deduction(scenario.trade.estCredit))}</td>
      </tr>
      <tr>
        <td>Gewerbesteuer nach Anrechnung</td>
        <td class="text-right font-bold tabular-nums">{centsToEur(scenario.gewStNetCent)}</td>
      </tr>
    {/if}

    <tr>
      <td>Umsatzsteuer-Schuld bis heute</td>
      <td class="text-right tabular-nums">
        {#if result.flags.isKleinunternehmer}
          <span class="whitespace-nowrap text-muted-foreground">entfällt, Kleinunternehmer (§ 19 UStG)</span>
        {:else}
          {centsToEur(result.ustSchuldYtdCent)}
        {/if}
      </td>
    </tr>

    <tr>
      <td class="font-bold">Summe der Steuerlast</td>
      <td class="text-right font-bold tabular-nums">{centsToEur(scenario.totalTaxBurdenCent)}</td>
    </tr>
    <tr>
      <td>Geleistete Vorauszahlungen</td>
      <td class="text-right tabular-nums">{centsToEur(deduction(result.prepaymentsCent))}</td>
    </tr>
    <tr>
      <td class="font-bold">Noch zurücklegen</td>
      <td class="text-right font-bold tabular-nums">{centsToEur(scenario.recommendedReserveCent)}</td>
    </tr>
  </tbody>
</table>

{#if prepayments.kind !== "none" && prepayments.surplusCent > 0}
  <p class="mt-3 text-[13px] text-muted-foreground">
    Deine Vorauszahlungen übersteigen die geschätzte Steuerlast um {centsToEur(prepayments.surplusCent)}. Dieser
    Überschuss ist oben nicht abgezogen, die Rücklage bleibt bei {centsToEur(0)}.
  </p>
{/if}
