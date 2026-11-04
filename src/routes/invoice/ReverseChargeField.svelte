<script lang="ts">
  import type { ReverseChargeType, SupplyKind } from "$lib/db/invoices";
  import type { Customer, Settings } from "$lib/db/schema";
  import { Label, Select } from "$lib/ui";
  import { reverseChargeState } from "./form-validation";
  import SupplyKindField from "./SupplyKindField.svelte";

  type Props = {
    type: ReverseChargeType;
    supplyKind: SupplyKind;
    settings: Settings | null;
    customer: Customer | null;
    disabled?: boolean;
    allowThirdCountry?: boolean;
    note?: string;
  };
  let {
    type = $bindable(),
    supplyKind = $bindable(),
    settings,
    customer,
    disabled = false,
    allowThirdCountry = true,
    note,
  }: Props = $props();

  const HINTS: Record<ReverseChargeType, string> = {
    none: "Inlandsumsatz oder regulärer Umsatzsteuerausweis.",
    intra_eu: "Innergemeinschaftlicher Umsatz an ein EU-Unternehmen. Alle Positionen auf 0 % USt.",
    third_country: "Umsatz an einen Kunden im Drittland. Alle Positionen auf 0 % USt.",
  };

  const rc = $derived(settings ? reverseChargeState(type, settings, customer) : null);
  const typeItems = $derived.by(() => {
    const items: { value: ReverseChargeType; label: string; disabled?: boolean }[] = [
      { value: "none", label: "Keine" },
      { value: "intra_eu", label: "Innergemeinschaftlich (EU-B2B)", disabled: !rc?.canIntraEu },
    ];
    if (allowThirdCountry) {
      items.push({ value: "third_country", label: "Ausfuhrlieferung Drittland", disabled: !rc?.canThirdCountry });
    }
    return items;
  });

  // Judged only once settings and customers are known; otherwise a stored
  // type would be reset before the data it depends on arrives.
  $effect(() => {
    if (rc && rc.allowedType !== type) type = rc.allowedType;
  });
</script>

{#if rc && !settings?.isKleinunternehmer}
  <div class="col-span-2 flex flex-col gap-1.5">
    <Label>Reverse-Charge</Label>
    <Select bind:value={type} items={typeItems} disabled={disabled || !rc.canThirdCountry} />
    <p class="text-xs text-muted-foreground">{HINTS[type]}{#if note && type !== "none"} {note}{/if}</p>
    {#if rc.blockedReason}
      <p class="text-xs text-warning">{rc.blockedReason}</p>
    {/if}
  </div>
  {#if type !== "none"}
    <SupplyKindField bind:value={supplyKind} reverseChargeType={type} {disabled} />
  {/if}
{/if}
