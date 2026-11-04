<script lang="ts">
  import type { ReverseChargeType, SupplyKind } from "$lib/db/invoices";
  import type { Customer } from "$lib/db/schema";
  import { Label, Select } from "$lib/ui";
  import { reverseChargeState, type ReverseChargeSender } from "./form-validation";
  import SupplyKindField from "./SupplyKindField.svelte";

  type Props = {
    type: ReverseChargeType;
    supplyKind: SupplyKind;
    /** Settings, or the stored Kleinunternehmer status of an existing document; null while loading. */
    sender: ReverseChargeSender | null;
    customer: Customer | null;
    disabled?: boolean;
    note?: string;
  };
  let {
    type = $bindable(),
    supplyKind = $bindable(),
    sender,
    customer,
    disabled = false,
    note,
  }: Props = $props();

  const HINTS: Record<ReverseChargeType, string> = {
    none: "Inlandsumsatz oder regulärer Umsatzsteuerausweis.",
    intra_eu: "Innergemeinschaftlicher Umsatz an ein EU-Unternehmen. Alle Positionen auf 0 % USt.",
    third_country: "Umsatz an einen Kunden im Drittland. Alle Positionen auf 0 % USt.",
  };

  const rc = $derived(sender ? reverseChargeState(type, sender, customer) : null);
  const typeItems = $derived<{ value: ReverseChargeType; label: string; disabled?: boolean }[]>([
    { value: "none", label: "Keine" },
    { value: "intra_eu", label: "Innergemeinschaftlich (EU-B2B)", disabled: !rc?.canIntraEu },
    { value: "third_country", label: "Ausfuhrlieferung Drittland", disabled: !rc?.canThirdCountry },
  ]);
</script>

<!-- A blocked selection stays visible and changeable until the user picks a permitted type. -->
{#if rc && (!sender?.isKleinunternehmer || rc.selectionBlocked)}
  <div class="col-span-2 flex flex-col gap-1.5">
    <Label>Reverse-Charge</Label>
    <Select bind:value={type} items={typeItems} disabled={disabled || (!rc.canThirdCountry && !rc.selectionBlocked)} />
    <p class="text-xs text-muted-foreground">{HINTS[type]}{#if note && type !== "none"} {note}{/if}</p>
    {#if rc.unavailableReason}
      <p class="text-xs {rc.selectionBlocked ? 'text-warning' : 'text-muted-foreground'}">{rc.unavailableReason}</p>
    {/if}
  </div>
  {#if type !== "none"}
    <SupplyKindField bind:value={supplyKind} reverseChargeType={type} {disabled} />
  {/if}
{/if}
