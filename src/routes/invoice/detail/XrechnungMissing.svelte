<script lang="ts">
  import { Button } from "$lib/ui";
  import { AlertTriangle } from "$lib/brand-icons";
  import { companySettingsRoute } from "$lib/utils/company-completeness";

  type Props = { missing: string[]; customerId: number };
  let { missing, customerId }: Props = $props();
</script>

<div class="flex items-start gap-2.5 text-sm" role="alert">
  <AlertTriangle class="mt-0.5 size-4 shrink-0 text-status-warn" />
  <div class="min-w-0">
    <div class="font-bold text-status-warn">XRechnung nicht möglich: Pflichtangaben fehlen</div>
    <ul class="mt-1 list-disc pl-5 text-muted-foreground">
      {#each missing as field (field)}
        <li>{field}</li>
      {/each}
    </ul>
    <p class="mt-2 text-xs text-muted-foreground">
      Leitweg-ID und E-Mail des Kunden werden aus den aktuellen Kundendaten gelesen; die Anschrift stammt
      aus der ausgestellten Rechnung.
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <Button href={companySettingsRoute(missing)} size="sm" variant="outline">Firmendaten</Button>
      <Button href={`/customers/${customerId}/edit`} size="sm" variant="outline">Kunde bearbeiten</Button>
    </div>
  </div>
</div>
