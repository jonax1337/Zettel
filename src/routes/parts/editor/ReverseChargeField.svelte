<script lang="ts">
  import type { ReverseChargeType, SupplyKind } from "$lib/db/invoices";
  import type { Customer } from "$lib/db/schema";
  import { Field, Select } from "$lib/ui";
  import { reverseChargeState, type ReverseChargeSender } from "../../invoice/form-validation";
  import { SUPPLY_KIND_HINT, SUPPLY_KIND_ITEMS } from "../../invoice/supply-kind";

  type Props = {
    type: ReverseChargeType;
    supplyKind: SupplyKind;
    /** Settings, or the stored Kleinunternehmer status of an existing document; null while loading. */
    sender: ReverseChargeSender | null;
    customer: Customer | null;
    disabled?: boolean;
    note?: string;
    error?: string | null;
  };
  let {
    type = $bindable(),
    supplyKind = $bindable(),
    sender,
    customer,
    disabled = false,
    note,
    error = null,
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
  <Field label="Reverse-Charge" {error}>
    {#snippet hint()}
      {HINTS[type]}{#if note && type !== "none"} {note}{/if}
      {#if rc.unavailableReason}
        <br /><span class={rc.selectionBlocked ? "text-warning" : undefined}>{rc.unavailableReason}</span>
      {/if}
    {/snippet}
    <Select
      bind:value={type}
      items={typeItems}
      disabled={disabled || (!rc.canThirdCountry && !rc.selectionBlocked)}
    />
  </Field>
  {#if type !== "none"}
    <Field label="Art des Umsatzes" hint={SUPPLY_KIND_HINT[type][supplyKind]}>
      <Select bind:value={supplyKind} items={SUPPLY_KIND_ITEMS} {disabled} />
    </Field>
  {/if}
{/if}
