<script lang="ts">
  import {
    createCustomer,
    getCustomer,
    updateCustomer,
    type CustomerInput,
  } from "$lib/db/queries";
  import { Button, DatePicker, Label } from "$lib/ui";
  import { fromIsoDate, toIsoDate } from "$lib/utils/date";
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

  const LIST_ROUTE = "/customers";

  let form = $state<CustomerInput>(emptyPartyFields());
  let followUpIso = $state<string>("");

  const entity = createEntityForm({
    mode: () => mode,
    fetchById: getCustomer,
    notFoundMessage: "Kunde nicht gefunden.",
    onLoaded: (customer) => {
      form = partyFieldsFrom(customer);
      followUpIso = customer.followUpDate ? toIsoDate(customer.followUpDate) : "";
    },
    create: () => createCustomer(form),
    update: (id) => updateCustomer(id, form),
    createdMessage: "Kunde angelegt",
    listRoute: LIST_ROUTE,
  });

  $effect(() => {
    if (mode === "edit") entity.loadTarget(params?.id);
  });

  const newInvoiceRoute = (customerId: number) => `/invoices/new?customerId=${customerId}`;

  function onSubmit(submitter: HTMLElement | null) {
    const country = normalizeCountryCode(form.country);
    if (!country) return entity.reject("Land ungültig", INVALID_COUNTRY_MESSAGE);
    form.country = country;
    form.followUpDate = followUpIso ? fromIsoDate(followUpIso) : null;
    return entity.save(submitter?.dataset.next === "invoice" ? newInvoiceRoute : undefined);
  }
</script>

<EntityFormShell
  backHref={LIST_ROUTE}
  backLabel="Kunden"
  title={mode === "new" ? "Neuer Kunde" : "Kunde bearbeiten"}
  {mode}
  loading={entity.loading}
  saving={entity.saving}
  error={entity.error}
  {onSubmit}
>
  {#snippet extraActions()}
    <Button type="submit" variant="outline" disabled={entity.saving} data-next="invoice">
      Speichern &amp; Rechnung erstellen
    </Button>
  {/snippet}
  <PartyAddressFields bind:form requireAddress />

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
</EntityFormShell>
