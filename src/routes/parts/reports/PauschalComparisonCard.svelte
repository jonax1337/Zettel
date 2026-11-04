<script lang="ts">
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/ui";
  import { centsToEur } from "$lib/utils/money";
  import type { TaxRücklageResult } from "$lib/dashboard/tax";
  import Metric from "./Metric.svelte";

  type Props = { result: TaxRücklageResult };
  let { result }: Props = $props();

  const percent = $derived(result.flags.pauschalPercent);
  const delta = $derived(result.pauschalDeltaCent);
  const deltaCaption = $derived(
    delta > 0
      ? "Detail höher — Pauschal unterschätzt"
      : delta < 0
        ? "Pauschal höher — du legst zu viel zurück"
        : "identisch",
  );
</script>

<Card class="mb-6">
  <CardHeader>
    <CardTitle>Detail vs. Pauschal</CardTitle>
    <CardDescription>
      Detailmodus rechnet ESt+Soli+KiSt+GewSt+USt aus dem hochgerechneten Gewinn.
      Pauschalmodus nimmt schlicht {percent} % vom Brutto-Umsatz YTD.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Metric
        label="Detail-Rücklage"
        value={centsToEur(result.projected.recommendedReserveCent)}
        caption="aus dem Tarif (Projektion)"
      />
      <Metric
        label="Pauschal {percent} %"
        value={centsToEur(result.pauschalReserveCent)}
        caption="{percent} % × {centsToEur(result.revenueYtdGrossCent)} Brutto-Umsatz"
      />
      <Metric
        label="Differenz"
        value="{delta >= 0 ? '+' : ''}{centsToEur(delta)}"
        caption={deltaCaption}
        valueClass={delta >= 0 ? "text-foreground" : "text-muted-foreground"}
      />
    </div>
  </CardContent>
</Card>
