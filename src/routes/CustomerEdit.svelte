<script lang="ts">
  import {
    createCustomer,
    getCustomer,
    updateCustomer,
    type CustomerInput,
  } from "$lib/db/queries";
  import { push } from "svelte-spa-router";
  import { Button, Card, CardContent, Checkbox, DatePicker, Input, Label, PageHeader, SaveBar } from "$lib/ui";
  import { fromIsoDate, toIsoDate } from "$lib/utils/date";
  import { INVALID_COUNTRY_MESSAGE, normalizeCountryCode } from "./parts/entity/country";
  import { createEntityForm } from "./parts/entity/entity-form.svelte";
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
  // Saving opens the saved customer's page in both cases (see onSubmit).
  const backRoute = $derived(mode === "edit" && params?.id ? customerPageRoute(params.id) : LIST_ROUTE);
  const backLabel = $derived(mode === "edit" ? customerName || "Kunde" : "Kunden");

  function onSubmit(submitter: HTMLElement | null) {
    const country = normalizeCountryCode(form.country);
    if (!country) return entity.reject("Land ungültig", INVALID_COUNTRY_MESSAGE);
    form.country = country;
    form.followUpDate = followUpIso ? fromIsoDate(followUpIso) : null;
    form.receivesXrechnung = receivesXrechnung;
    form.leitwegId = leitwegId.trim() || null;
    return entity.save(submitter?.dataset.next === "invoice" ? newInvoiceRoute : customerPageRoute);
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    onSubmit(e.submitter);
  }
</script>

<PageHeader title={mode === "new" ? "Neuer Kunde" : "Kunde bearbeiten"} back={{ href: backRoute, label: backLabel }} />

{#if entity.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form onsubmit={handleSubmit}>
    <Card>
      <CardContent class="space-y-6">
        <PartyAddressFields bind:form requireAddress />

        <section class="flex flex-col gap-4">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox bind:checked={receivesXrechnung} />
            <span>Empfängt XRechnung (öffentlicher Auftraggeber)</span>
          </label>
          {#if receivesXrechnung || leitwegId}
            <div class="flex flex-col gap-1.5">
              <Label>Leitweg-ID</Label>
              <Input bind:value={leitwegId} placeholder="z. B. 04011000-1234512345-35" />
              <p class="text-xs text-muted-foreground">
                Wird als Käuferreferenz in neue Rechnungen übernommen und ist für XRechnungen Pflicht.
              </p>
            </div>
          {/if}
        </section>

        <section class="grid grid-cols-2 gap-4">
          <div class="col-span-2">
            <PartyNotesField bind:value={form.notes} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Wiedervorlage am</Label>
            <DatePicker bind:value={followUpIso} />
            <p class="text-xs text-muted-foreground">Optional — Erinnerung im Dashboard.</p>
          </div>
        </section>
      </CardContent>
    </Card>

    <SaveBar>
      <Button type="submit" disabled={entity.saving}>{entity.saving ? "Speichere…" : "Speichern"}</Button>
      <Button type="submit" variant="outline" disabled={entity.saving} data-next="invoice">
        Speichern &amp; Rechnung erstellen
      </Button>
      <Button type="button" variant="ghost" onclick={() => push(backRoute)}>Abbrechen</Button>
      {#if entity.error}
        <span class="text-sm text-destructive">{entity.error}</span>
      {/if}
    </SaveBar>
  </form>
{/if}
