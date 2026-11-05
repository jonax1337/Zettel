<script lang="ts" generics="T extends PartyFields">
  import { Input, Label } from "$lib/ui";
  import { ISO_COUNTRY_CODE_LENGTH } from "./country";
  import type { PartyFields } from "./party-form";

  type Props = {
    form: T;
    /** Customers need a full address for EN16931 e-invoices; vendors may leave it empty. */
    requireAddress?: boolean;
  };
  let { form = $bindable(), requireAddress = false }: Props = $props();
</script>

{#snippet requiredMark()}
  {#if requireAddress}<span class="text-destructive">*</span>{/if}
{/snippet}

<section class="grid grid-cols-2 gap-4">
  <div class="col-span-2 flex flex-col gap-1.5">
    <Label>Name / Firma <span class="text-destructive">*</span></Label>
    <Input bind:value={form.name} required />
  </div>
  <div class="col-span-2 flex flex-col gap-1.5">
    <Label>Ansprechpartner:in</Label>
    <Input bind:value={form.contactPerson} />
  </div>
</section>

<section class="grid grid-cols-3 gap-4">
  <div class="col-span-3 flex flex-col gap-1.5">
    <Label>Straße & Nr. {@render requiredMark()}</Label>
    <Input bind:value={form.street} required={requireAddress} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label>PLZ {@render requiredMark()}</Label>
    <Input bind:value={form.postalCode} required={requireAddress} />
  </div>
  <div class="col-span-2 flex flex-col gap-1.5">
    <Label>Ort {@render requiredMark()}</Label>
    <Input bind:value={form.city} required={requireAddress} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label>Land {@render requiredMark()}</Label>
    <Input bind:value={form.country} required maxlength={ISO_COUNTRY_CODE_LENGTH} placeholder="DE" />
  </div>
  {#if requireAddress}
    <p class="col-span-3 text-xs text-muted-foreground -mt-2">
      Pflichtfelder für EN16931-konforme E-Rechnungen. Land als ISO-2-Code (DE, AT, FR…).
    </p>
  {/if}
</section>

<section class="grid grid-cols-2 gap-4">
  <div class="flex flex-col gap-1.5">
    <Label>E-Mail</Label>
    <Input type="email" bind:value={form.email} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label>Telefon</Label>
    <Input bind:value={form.phone} />
  </div>
  <div class="col-span-2 flex flex-col gap-1.5">
    <Label>USt-IdNr.</Label>
    <Input bind:value={form.vatId} />
  </div>
</section>
