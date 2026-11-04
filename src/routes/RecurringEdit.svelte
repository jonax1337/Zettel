<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    createRecurring,
    getRecurring,
    updateRecurring,
    type RecurringFormInput,
  } from "$lib/db/recurring";
  import { getInvoice, type ReverseChargeType, type SupplyKind } from "$lib/db/invoices";
  import type { RecurringInterval, Settings } from "$lib/db/schema";
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { computeTotals } from "$lib/utils/totals";
  import {
    Button,
    Input,
    Textarea,
    Label,
    Card,
    CardContent,
    DatePicker,
    Select,
    Checkbox,
    toast,
  } from "$lib/ui";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { fetchEditTarget, parseId } from "./parts/entity/edit-target";
  import { RECURRING_INTERVAL_ITEMS } from "./parts/entity/recurring";
  import { vatRateForNewItem } from "./parts/entity/vat";
  import ReverseChargeField from "./invoice/ReverseChargeField.svelte";
  import { createDocumentFormData } from "./invoice/document-form.svelte";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import LineItemsEditor from "./invoice/LineItemsEditor.svelte";
  import {
    lineItemFromStored,
    newLineItem,
    toLineItemInputs,
    zeroVatRates,
    type LineItemForm,
  } from "./invoice/line-items";
  import { paymentTermDays } from "./parts/recurring/payment-term-days";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
    querystring?: string;
  };
  let { mode, params, querystring }: Props = $props();

  const fromInvoiceId = $derived.by(() => {
    if (mode !== "new" || !querystring) return null;
    const raw = new URLSearchParams(querystring).get("fromInvoice");
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  });

  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);

  let name = $state("");
  let customerIdStr = $state<string>("");
  let interval = $state<RecurringInterval>("monthly");
  let startDateIso = $state(toIsoDate(nowUnix()));
  let paymentTermsDays = $state(14);
  let reverseChargeType = $state<ReverseChargeType>("none");
  let supplyKind = $state<SupplyKind>(DEFAULT_SUPPLY_KIND);
  let active = $state(true);
  let notes = $state("");
  let paymentTerms = $state("");
  let items = $state<LineItemForm[]>([newLineItem()]);

  const isReverseCharge = $derived(reverseChargeType !== "none");
  const reference = createDocumentFormData({
    customerId: () => customerIdStr,
    onLoaded: async (loadedSettings) => {
      if (mode === "new") await prepareNewTemplate(loadedSettings);
    },
    onError: (message) => (error = message),
  });
  const settings = $derived(reference.settings);
  const vatExempt = $derived(!!settings?.isKleinunternehmer || isReverseCharge);

  const totals = $derived(
    settings
      ? computeTotals(items, { isKleinunternehmer: settings.isKleinunternehmer, isReverseCharge })
      : { subtotal: 0, vatAmount: 0, total: 0 },
  );

  $effect(() => {
    if (isReverseCharge) zeroVatRates(items);
  });

  async function prepareNewTemplate(loadedSettings: Settings) {
    paymentTermsDays = loadedSettings.defaultPaymentTermsDays;
    for (const item of items) item.vatRate = vatRateForNewItem(loadedSettings.isKleinunternehmer);
    if (fromInvoiceId !== null) await prefillFromInvoice(fromInvoiceId, loadedSettings);
  }

  async function prefillFromInvoice(invoiceId: number, loadedSettings: Settings) {
    const source = await getInvoice(invoiceId);
    if (!source) return;
    const { invoice } = source;
    customerIdStr = String(invoice.customerId);
    reverseChargeType = invoice.isReverseCharge ? "intra_eu" : "none";
    supplyKind = invoice.supplyKind;
    paymentTerms = invoice.paymentTerms ?? "";
    paymentTermsDays = paymentTermDays(
      invoice.issueDate,
      invoice.dueDate,
      loadedSettings.defaultPaymentTermsDays,
    );
    if (source.items.length > 0) items = source.items.map(lineItemFromStored);
    startDateIso = "";
  }

  $effect(() => {
    if (mode !== "edit") return;
    fetchEditTarget(params?.id, getRecurring, "Vorlage nicht gefunden.")
      .then((target) => {
        if ("error" in target) {
          error = target.error;
          return;
        }
        id = target.id;
        applyTemplate(target.value);
      })
      .catch((e) => (error = String(e)))
      .finally(() => (loaded = true));
  });

  function applyTemplate({ recurring, items: storedItems }: NonNullable<Awaited<ReturnType<typeof getRecurring>>>) {
    name = recurring.name;
    customerIdStr = String(recurring.customerId);
    interval = recurring.interval;
    startDateIso = toIsoDate(recurring.startDate);
    paymentTermsDays = recurring.paymentTermsDays;
    reverseChargeType = recurring.isReverseCharge ? "intra_eu" : "none";
    supplyKind = recurring.supplyKind;
    active = recurring.active;
    notes = recurring.notes ?? "";
    paymentTerms = recurring.paymentTerms ?? "";
    items = storedItems.map(lineItemFromStored);
  }

  function buildInput(customerId: number): RecurringFormInput {
    return {
      name: name.trim(),
      customerId,
      interval,
      startDate: fromIsoDate(startDateIso),
      paymentTermsDays,
      isReverseCharge,
      supplyKind,
      notes: notes.trim() || null,
      paymentTerms: paymentTerms.trim() || null,
      active,
      items: toLineItemInputs(items),
    };
  }

  async function persist(input: RecurringFormInput) {
    if (mode === "new") {
      await createRecurring(input);
      toast.success("Vorlage erstellt");
    } else if (id !== null) {
      await updateRecurring(id, input);
      toast.success("Änderungen gespeichert");
    } else {
      throw new Error("Keine ID");
    }
  }

  async function save(input: RecurringFormInput) {
    saving = true;
    error = null;
    try {
      await persist(input);
      push("/recurring");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const customerId = parseId(customerIdStr);
    if (!name.trim()) error = "Bitte einen Namen vergeben.";
    else if (customerId === null) error = "Bitte einen Kunden auswählen.";
    else if (items.length === 0) error = "Mindestens eine Position erforderlich.";
    else void save(buildInput(customerId));
  }
</script>

<header class="mb-6">
  <BackLink href="/recurring">Wiederkehrende Rechnungen</BackLink>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">
    {mode === "new" ? "Neue Vorlage" : "Vorlage bearbeiten"}
  </h1>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form onsubmit={onSubmit} class="space-y-6">
    <Card>
      <CardContent>
        <section class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Bezeichnung <span class="text-destructive">*</span></Label>
            <Input bind:value={name} placeholder="z. B. Monatlicher Retainer Acme" required />
          </div>
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Kunde <span class="text-destructive">*</span></Label>
            <Select bind:value={customerIdStr} items={reference.customerItems} placeholder="— bitte wählen —" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Intervall</Label>
            <Select
              bind:value={() => interval, (v) => (interval = v as RecurringInterval)}
              items={RECURRING_INTERVAL_ITEMS}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Erste Fälligkeit</Label>
            <DatePicker bind:value={startDateIso} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Zahlungsfrist (Tage)</Label>
            <Input type="number" min="0" bind:value={paymentTermsDays} />
          </div>
          <label class="flex items-center gap-2.5 text-sm cursor-pointer select-none">
            <Checkbox bind:checked={active} />
            Aktiv (erscheint im Dashboard)
          </label>
          <ReverseChargeField
            bind:type={reverseChargeType}
            bind:supplyKind
            {settings}
            customer={reference.selectedCustomer}
            allowThirdCountry={false}
            note="Wird bei jeder erzeugten Rechnung übernommen."
          />
        </section>
      </CardContent>
    </Card>

    <LineItemsEditor
      bind:items
      currency="EUR"
      {vatExempt}
      {totals}
      language="de"
      totalLabel="Voraussichtlicher Gesamtbetrag pro Erzeugung"
    />

    <Card>
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-1.5">
          <Label>Zahlungsbedingungen</Label>
          <Textarea rows={2} bind:value={paymentTerms} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Notizen / Fußtext</Label>
          <Textarea rows={3} bind:value={notes} />
        </div>
      </CardContent>
    </Card>

    <div class="flex items-center gap-3">
      <Button type="submit" disabled={saving}>
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </Button>
      <a href="/recurring" use:link>
        <Button type="button" variant="ghost">Abbrechen</Button>
      </a>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
