<script lang="ts">
  import { createVendor, type VendorInput } from "$lib/db/queries";
  import { Button, Dialog, Input, Label, toast } from "$lib/ui";
  import {
    INVALID_COUNTRY_MESSAGE,
    ISO_COUNTRY_CODE_LENGTH,
    normalizeCountryCode,
  } from "../entity/country";
  import { emptyVendorDraft } from "./vendor-draft";

  type Props = {
    open: boolean;
    /** What the imported PDF says about the seller; null opens an empty form. */
    prefill: VendorInput | null;
    onCreated: (vendorId: number) => void;
  };
  let { open = $bindable(), prefill, onCreated }: Props = $props();

  let form = $state<VendorInput>(emptyVendorDraft());
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) return;
    form = { ...emptyVendorDraft(), ...prefill };
    error = null;
  });

  async function create() {
    const country = normalizeCountryCode(form.country);
    if (!form.name.trim()) {
      error = "Bitte einen Namen eintragen.";
      return;
    }
    if (!country) {
      error = INVALID_COUNTRY_MESSAGE;
      return;
    }
    saving = true;
    error = null;
    try {
      const vendorId = await createVendor({ ...form, name: form.name.trim(), country });
      toast.success("Lieferant angelegt");
      open = false;
      onCreated(vendorId);
    } catch (e) {
      error = String(e);
      toast.error("Lieferant konnte nicht angelegt werden", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Lieferant anlegen"
  description="Die Eingangsrechnung bleibt dabei unverändert; der neue Lieferant wird danach ausgewählt."
>
  <div class="grid grid-cols-3 gap-3">
    <div class="col-span-3 flex flex-col gap-1.5">
      <Label for="quick-vendor-name">Name / Firma <span class="text-destructive">*</span></Label>
      <Input id="quick-vendor-name" bind:value={form.name} />
    </div>
    <div class="col-span-3 flex flex-col gap-1.5">
      <Label for="quick-vendor-street">Straße & Nr.</Label>
      <Input id="quick-vendor-street" bind:value={form.street} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="quick-vendor-zip">PLZ</Label>
      <Input id="quick-vendor-zip" bind:value={form.postalCode} />
    </div>
    <div class="col-span-2 flex flex-col gap-1.5">
      <Label for="quick-vendor-city">Ort</Label>
      <Input id="quick-vendor-city" bind:value={form.city} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="quick-vendor-country">Land</Label>
      <Input
        id="quick-vendor-country"
        bind:value={form.country}
        maxlength={ISO_COUNTRY_CODE_LENGTH}
        placeholder="DE"
      />
    </div>
    <div class="col-span-2 flex flex-col gap-1.5">
      <Label for="quick-vendor-vat">USt-IdNr.</Label>
      <Input id="quick-vendor-vat" bind:value={form.vatId} />
    </div>
  </div>
  {#if error}
    <p class="text-sm text-destructive">{error}</p>
  {/if}
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)}>Abbrechen</Button>
    <Button onclick={create} disabled={saving}>{saving ? "Lege an…" : "Lieferant anlegen"}</Button>
  {/snippet}
</Dialog>
