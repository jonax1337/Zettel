<script lang="ts">
  import { Stat, StatRow } from "$lib/ui";
  import { centsToEur } from "$lib/utils/money";
  import type { TaxRücklageResult } from "$lib/dashboard/tax";

  type Props = { result: TaxRücklageResult };
  let { result }: Props = $props();

  const percent = $derived(result.flags.pauschalPercent);
  const delta = $derived(result.pauschalDeltaCent);
  const deltaHint = $derived(
    delta > 0
      ? "Detail höher, die Pauschale unterschätzt"
      : delta < 0
        ? "Pauschale höher, du legst zu viel zurück"
        : "identisch",
  );
</script>

<div class="mb-2.5 flex items-baseline gap-2.5">
  <h2>Detail gegen Pauschale</h2>
</div>
<p class="mb-3 max-w-[78ch] text-[13px] text-muted-foreground">
  Der Detailmodus rechnet Einkommensteuer, Soli, Kirchensteuer, Gewerbesteuer und Umsatzsteuer aus dem hochgerechneten
  Gewinn. Der Pauschalmodus nimmt schlicht {percent} % vom Brutto-Umsatz bis heute.
</p>
<StatRow>
  <Stat
    label="Detail-Rücklage"
    value={centsToEur(result.projected.recommendedReserveCent)}
    hint="aus dem Tarif, hochgerechnet"
  />
  <Stat
    label="Pauschale {percent} %"
    value={centsToEur(result.pauschalReserveCent)}
    hint="{percent} % von {centsToEur(result.revenueYtdGrossCent)} Brutto-Umsatz"
  />
  <Stat label="Differenz" value="{delta >= 0 ? '+' : ''}{centsToEur(delta)}" hint={deltaHint} />
</StatRow>
