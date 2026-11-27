<script lang="ts">
  import {
    createVendor,
    getVendor,
    updateVendor,
    type VendorInput,
  } from "$lib/db/queries";
  import { Button, Field, FieldGrid, FormSection, IbanInput, Input, PageHeader, SaveBar, focusFirstInvalid } from "$lib/ui";
  import { tick } from "svelte";
  import { push } from "svelte-spa-router";
  import { normalizeCountryCode } from "./parts/entity/country";
  import { createEntityForm } from "./parts/entity/entity-form.svelte";
  import { validateParty } from "./parts/entity/entity-validation";
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

  let formEl = $state<HTMLFormElement | null>(null);
  let attempted = $state(false);
  const errors = $derived(attempted ? validateParty(form, { requireAddress: false }) : {});

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    attempted = true;
    if (Object.keys(validateParty(form, { requireAddress: false })).length > 0) {
      await tick();
      if (formEl) focusFirstInvalid(formEl);
      return;
    }
    form.country = normalizeCountryCode(form.country) ?? form.country;
    await entity.save();
  }
</script>

<PageHeader
  title={mode === "new" ? "Neuer Lieferant" : "Lieferant bearbeiten"}
  back={{ href: LIST_ROUTE, label: "Lieferanten" }}
/>

{#if entity.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form bind:this={formEl} onsubmit={handleSubmit} novalidate>
    <div class="max-w-2xl">
      <PartyAddressFields bind:form {errors} />

      <FormSection title="Steuer und Buchhaltung">
        <FieldGrid>
          <Field label="USt-IdNr." wide>
            <Input bind:value={form.vatId} />
          </Field>
          <Field label="Standard-Kategorie" wide hint="Wird bei neuen Ausgaben dieses Lieferanten vorausgefüllt.">
            <Input bind:value={form.defaultCategory} placeholder="z. B. Hosting, Software, Bürobedarf" />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="Bankverbindung" description="Für Überweisungen.">
        <FieldGrid>
          <Field label="Bank" wide>
            <Input bind:value={form.bankName} />
          </Field>
          <Field label="IBAN">
            <IbanInput bind:value={form.bankIban} />
          </Field>
          <Field label="BIC">
            <Input bind:value={form.bankBic} />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="Notiz">
        <PartyNotesField bind:value={form.notes} />
      </FormSection>
    </div>

    <SaveBar>
      <Button type="submit" disabled={entity.saving}>{entity.saving ? "Speichere…" : "Speichern"}</Button>
      <Button type="button" variant="outline" onclick={() => push(LIST_ROUTE)}>Abbrechen</Button>
      {#if entity.error}
        <span class="min-w-0 text-sm text-destructive" role="alert">{entity.error}</span>
      {/if}
    </SaveBar>
  </form>
{/if}
