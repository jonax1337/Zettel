<script lang="ts">
  import { Field, Select } from "$lib/ui";
  import type { Customer } from "$lib/db/schema";
  import { customerAddressLines } from "./address-lines";
  import { QUIET_FIELD } from "./quiet-field";

  type Props = {
    /** The sender line above the window; empty while the settings load. */
    senderLine: string;
    customerItems: { value: string; label: string }[];
    customerIdStr: string;
    customer: Customer | null;
    disabled?: boolean;
    error?: string | null;
    /** Why the customer cannot be changed. */
    lockedNote?: string;
  };
  let {
    senderLine,
    customerItems,
    customerIdStr = $bindable(),
    customer,
    disabled = false,
    error = null,
    lockedNote,
  }: Props = $props();

  // The picker already shows the name, so the address starts below it.
  const addressLines = $derived(customer ? customerAddressLines(customer).slice(1) : []);
</script>

<div class="min-w-[16rem] max-w-[22rem] flex-1">
  {#if senderLine}
    <p class="mb-2 text-[11.5px] text-muted-foreground">{senderLine}</p>
  {/if}
  <Field label="Kunde" required {error} hint={lockedNote}>
    <Select
      bind:value={customerIdStr}
      items={customerItems}
      placeholder="Kunde auswählen"
      {disabled}
      class="{QUIET_FIELD} font-bold"
    />
  </Field>
  {#if addressLines.length > 0}
    <address class="mt-2 px-3 leading-relaxed not-italic">
      {#each addressLines as line, index (index)}
        <div>{line}</div>
      {/each}
    </address>
  {/if}
</div>
