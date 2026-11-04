<script lang="ts">
  import {
    createVendor,
    getVendor,
    updateVendor,
    type VendorInput,
  } from "$lib/db/queries";
  import { IbanInput, Input, Label } from "$lib/ui";
  import { INVALID_COUNTRY_MESSAGE, normalizeCountryCode } from "./parts/entity/country";
  import { createEntityForm } from "./parts/entity/entity-form.svelte";
  import EntityFormShell from "./parts/entity/EntityFormShell.svelte";
  import PartyAddressFields from "./parts/entity/PartyAddressFields.svelte";
  import PartyNotesField from "./parts/entity/PartyNotesField.svelte";
  import { emptyPartyFields, partyFieldsFrom } from "./parts/entity/party-form";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const LIST_ROUTE = "/vendors";

  let form = $state<VendorInput>({
    ...emptyPartyFields(),
    bankName: null,
    bankIban: null,
    bankBic: null,
    defaultCategory: null,
  });

  const entity = createEntityForm({
    mode: () => mode,
    fetchById: getVendor,
    notFoundMessage: "Lieferant nicht gefunden.",
    onLoaded: (vendor) => {
      form = {
        ...partyFieldsFrom(vendor),
        bankName: vendor.bankName,
        bankIban: vendor.bankIban,
        bankBic: vendor.bankBic,
        defaultCategory: vendor.defaultCategory,
      };
    },
    create: () => createVendor(form),
    update: (id) => updateVendor(id, form),
    createdMessage: "Lieferant angelegt",
    listRoute: LIST_ROUTE,
    unsavedState: () => form,
  });

  $effect(() => {
    if (mode === "edit") entity.loadTarget(params?.id);
  });

  function onSubmit() {
    const country = normalizeCountryCode(form.country);
    if (!country) return entity.reject("Land ungültig", INVALID_COUNTRY_MESSAGE);
    form.country = country;
    return entity.save();
  }
</script>

<EntityFormShell
  backHref={LIST_ROUTE}
  backLabel="Lieferanten"
  title={mode === "new" ? "Neuer Lieferant" : "Lieferant bearbeiten"}
  {mode}
  loading={entity.loading}
  saving={entity.saving}
  error={entity.error}
  {onSubmit}
>
  <PartyAddressFields bind:form />

  <section class="grid grid-cols-2 gap-4">
    <div class="col-span-2 text-xs uppercase tracking-wider text-muted-foreground">
      Bankverbindung (für Überweisungen)
    </div>
    <div class="col-span-2 flex flex-col gap-1.5">
      <Label>Bank</Label>
      <Input bind:value={form.bankName} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label>IBAN</Label>
      <IbanInput bind:value={form.bankIban} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label>BIC</Label>
      <Input bind:value={form.bankBic} />
    </div>
  </section>

  <section class="grid grid-cols-1 gap-4">
    <div class="flex flex-col gap-1.5">
      <Label>Standard-Kategorie</Label>
      <Input
        bind:value={form.defaultCategory}
        placeholder="z. B. Hosting, Software, Bürobedarf"
      />
      <p class="text-xs text-muted-foreground">
        Wird bei neuen Eingangsrechnungen dieses Lieferanten vorausgefüllt.
      </p>
    </div>
    <PartyNotesField bind:value={form.notes} />
  </section>
</EntityFormShell>
