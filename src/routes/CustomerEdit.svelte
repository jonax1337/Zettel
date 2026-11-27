<script lang="ts">
  import {
    createCustomer,
    getCustomer,
    updateCustomer,
    type CustomerInput,
  } from "$lib/db/queries";
  import { tick } from "svelte";
  import { push } from "svelte-spa-router";
  import {
    Button,
    CheckField,
    DatePicker,
    Field,
    FieldGrid,
    FormSection,
    Input,
    PageHeader,
    SaveBar,
    focusFirstInvalid,
  } from "$lib/ui";
  import { fromIsoDate, toIsoDate } from "$lib/utils/date";
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

  const LIST_ROUTE = "/customers";
  const customerPageRoute = (customerId: number | string) => `/customers/${customerId}`;

  let form = $state<CustomerInput>(emptyPartyFields());
  let followUpIso = $state<string>("");
  let receivesXrechnung = $state(false);
  let leitwegId = $state("");
  let customerName = $state("");

  const entity = createEntityForm({
    mode: () => mode,
    fetchById: getCustomer,
    notFoundMessage: "Kunde nicht gefunden.",
    onLoaded: (customer) => {
      form = partyFieldsFrom(customer);
      customerName = customer.name;
      followUpIso = customer.followUpDate ? toIsoDate(customer.followUpDate) : "";
      receivesXrechnung = customer.receivesXrechnung;
      leitwegId = customer.leitwegId ?? "";
    },
    create: () => createCustomer(form),
    update: (id) => updateCustomer(id, form),
    createdMessage: "Kunde angelegt",
    listRoute: LIST_ROUTE,
    unsavedState: () => [form, followUpIso, receivesXrechnung, leitwegId],
  });

  $effect(() => {
    if (mode === "edit") entity.loadTarget(params?.id);
  });

  const newInvoiceRoute = (customerId: number) => `/invoices/new?customerId=${customerId}`;

  // Back link and "Abbrechen" lead to the customer page when editing, to the list when creating.
  // Saving opens the saved customer's page in both cases (see handleSubmit).
  const backRoute = $derived(mode === "edit" && params?.id ? customerPageRoute(params.id) : LIST_ROUTE);
  const backLabel = $derived(mode === "edit" ? customerName || "Kunde" : "Kunden");

  let formEl = $state<HTMLFormElement | null>(null);
  let attempted = $state(false);
  const errors = $derived(attempted ? validateParty(form, { requireAddress: true }) : {});

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    attempted = true;
    if (Object.keys(validateParty(form, { requireAddress: true })).length > 0) {
      await tick();
      if (formEl) focusFirstInvalid(formEl);
      return;
    }
    form.country = normalizeCountryCode(form.country) ?? form.country;
    form.followUpDate = followUpIso ? fromIsoDate(followUpIso) : null;
    form.receivesXrechnung = receivesXrechnung;
    form.leitwegId = leitwegId.trim() || null;
    await entity.save(e.submitter?.dataset.next === "invoice" ? newInvoiceRoute : customerPageRoute);
  }
</script>

<PageHeader title={mode === "new" ? "Neuer Kunde" : "Kunde bearbeiten"} back={{ href: backRoute, label: backLabel }} />

{#if entity.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form bind:this={formEl} onsubmit={handleSubmit} novalidate>
    <div class="max-w-2xl">
      <PartyAddressFields bind:form {errors} requireAddress />

      <FormSection title="Steuer und E-Rechnung">
        <FieldGrid>
          <Field label="USt-IdNr." wide>
            <Input bind:value={form.vatId} />
          </Field>
          <CheckField bind:checked={receivesXrechnung} wide label="Empfängt XRechnung (öffentlicher Auftraggeber)" />
          {#if receivesXrechnung || leitwegId}
            <Field
              label="Leitweg-ID"
              wide
              hint="Wird als Käuferreferenz in neue Rechnungen übernommen und ist für XRechnungen Pflicht."
            >
              <Input bind:value={leitwegId} placeholder="z. B. 04011000-1234512345-35" />
            </Field>
          {/if}
        </FieldGrid>
      </FormSection>

      <FormSection title="Notiz">
        <FieldGrid>
          <PartyNotesField bind:value={form.notes} wide />
          <Field label="Wiedervorlage am" hint="Optional, erinnert dich im Dashboard.">
            <DatePicker bind:value={followUpIso} />
          </Field>
        </FieldGrid>
      </FormSection>
    </div>

    <SaveBar>
      <Button type="submit" disabled={entity.saving}>{entity.saving ? "Speichere…" : "Speichern"}</Button>
      <Button type="submit" variant="outline" disabled={entity.saving} data-next="invoice">
        Speichern &amp; Rechnung erstellen
      </Button>
      <Button type="button" variant="outline" onclick={() => push(backRoute)}>Abbrechen</Button>
      {#if entity.error}
        <span class="min-w-0 text-sm text-destructive" role="alert">{entity.error}</span>
      {/if}
    </SaveBar>
  </form>
{/if}
