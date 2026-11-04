<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    computeTotals,
    createInvoice,
    getInvoice,
    updateInvoice,
    type InvoiceFormInput,
    type ReverseChargeType,
    type SupplyKind,
  } from "$lib/db/invoices";
  import type { Invoice, InvoiceItem, Settings } from "$lib/db/schema";
  import { computeEurTotalCent } from "$lib/utils/currency";
  import { addDaysUnix, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { Button, Card, CardContent, DatePicker, Label, Select, Textarea, toast } from "$lib/ui";
  import { AlertTriangle } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import CurrencyFields from "./invoice/CurrencyFields.svelte";
  import LineItemsEditor from "./invoice/LineItemsEditor.svelte";
  import PdfLanguageSelect from "./invoice/PdfLanguageSelect.svelte";
  import ReverseChargeField from "./invoice/ReverseChargeField.svelte";
  import ServicePeriodField from "./invoice/ServicePeriodField.svelte";
  import SkontoFields from "./invoice/SkontoFields.svelte";
  import { createDocumentFormData } from "./invoice/document-form.svelte";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import { vatRateForNewItem } from "./parts/entity/vat";
  import {
    exchangeRateError,
    linePeriodError,
    reverseChargeError,
    servicePeriodError,
  } from "./invoice/form-validation";
  import {
    lineItemFromStored,
    newLineItem,
    toLineItemInputs,
    zeroVatRates,
    type LineItemForm,
  } from "./invoice/line-items";
  import { INVALID_ROUTE_ID_MESSAGE, parseRouteId } from "./invoice/route-id";
  import {
    defaultSkontoForm,
    skontoFormFromSettings,
    skontoFormFromStored,
    skontoInput,
    type SkontoForm,
  } from "./invoice/skonto-form";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const DEFAULT_DUE_DAYS = 14;

  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);
  let loadError = $state<string | null>(null);

  let customerIdStr = $state("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let serviceMode = $state<"single" | "period">("single");
  let deliveryDateIso = $state("");
  let servicePeriodStartIso = $state("");
  let servicePeriodEndIso = $state("");
  let dueDateIso = $state(toIsoDate(addDaysUnix(nowUnix(), DEFAULT_DUE_DAYS)));
  let notes = $state("");
  let paymentTerms = $state("");
  let reverseChargeType = $state<ReverseChargeType>("none");
  let supplyKind = $state<SupplyKind>(DEFAULT_SUPPLY_KIND);
  let isCreditNote = $state(false);
  let items = $state<LineItemForm[]>([newLineItem()]);
  let currency = $state("EUR");
  let exchangeRate = $state("");
  let skonto = $state<SkontoForm>(defaultSkontoForm());
  let pdfLanguage = $state<"de" | "en">("de");

  const isReverseCharge = $derived(reverseChargeType !== "none");
  const reference = createDocumentFormData({
    customerId: () => customerIdStr,
    onLoaded: (loadedSettings) => {
      if (mode === "new") applyNewInvoiceDefaults(loadedSettings);
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

  $effect(() => {
    if (mode !== "edit") return;
    const invoiceId = parseRouteId(params?.id);
    if (invoiceId === null) {
      loadError = INVALID_ROUTE_ID_MESSAGE;
      loaded = true;
      return;
    }
    id = invoiceId;
    getInvoice(invoiceId)
      .then((res) => {
        if (!res) loadError = "Rechnung nicht gefunden.";
        else if (res.invoice.status !== "draft") loadError = "Nur Entwürfe können bearbeitet werden.";
        else applyStoredInvoice(res.invoice, res.items);
      })
      .catch((e) => (loadError = String(e)))
      .finally(() => (loaded = true));
  });

  function applyNewInvoiceDefaults(s: Settings) {
    paymentTerms = `Zahlbar innerhalb von ${s.defaultPaymentTermsDays} Tagen ohne Abzug.`;
    for (const item of items) item.vatRate = vatRateForNewItem(s.isKleinunternehmer);
    skonto = skontoFormFromSettings(s);
    pdfLanguage = s.defaultPdfLanguage;
  }

  function applyStoredInvoice(invoice: Invoice, storedItems: InvoiceItem[]) {
    customerIdStr = String(invoice.customerId);
    issueDateIso = toIsoDate(invoice.issueDate);
    deliveryDateIso = invoice.deliveryDate ? toIsoDate(invoice.deliveryDate) : "";
    if (invoice.servicePeriodStart && invoice.servicePeriodEnd) {
      serviceMode = "period";
      servicePeriodStartIso = toIsoDate(invoice.servicePeriodStart);
      servicePeriodEndIso = toIsoDate(invoice.servicePeriodEnd);
    }
    dueDateIso = toIsoDate(invoice.dueDate);
    notes = invoice.notes ?? "";
    paymentTerms = invoice.paymentTerms ?? "";
    reverseChargeType = invoice.reverseChargeType;
    supplyKind = invoice.supplyKind;
    isCreditNote = invoice.isCreditNote;
    currency = invoice.currency;
    exchangeRate = invoice.exchangeRate ?? "";
    skonto = skontoFormFromStored(invoice.skontoPercent, invoice.skontoDays);
    pdfLanguage = invoice.pdfLanguage;
    items = storedItems.map(lineItemFromStored);
  }

  function formError(): string | null {
    if (items.length === 0) return "Mindestens eine Position erforderlich.";
    return (
      (settings ? reverseChargeError(reverseChargeType, settings, reference.selectedCustomer, items) : null) ??
      exchangeRateError(currency, exchangeRate) ??
      (serviceMode === "period" ? servicePeriodError(servicePeriodStartIso, servicePeriodEndIso) : null) ??
      linePeriodError(items)
    );
  }

  function buildInput(customerId: number): InvoiceFormInput {
    const usesPeriod = serviceMode === "period";
    return {
      customerId,
      issueDate: fromIsoDate(issueDateIso),
      deliveryDate: !usesPeriod && deliveryDateIso ? fromIsoDate(deliveryDateIso) : null,
      dueDate: fromIsoDate(dueDateIso),
      notes: notes.trim() || null,
      paymentTerms: paymentTerms.trim() || null,
      reverseChargeType,
      supplyKind,
      items: toLineItemInputs(items),
      currency,
      exchangeRate: currency === "EUR" ? null : exchangeRate.trim(),
      eurTotalCent: computeEurTotalCent(currency, totals.total, exchangeRate),
      servicePeriodStart: usesPeriod ? fromIsoDate(servicePeriodStartIso) : null,
      servicePeriodEnd: usesPeriod ? fromIsoDate(servicePeriodEndIso) : null,
      ...skontoInput(skonto, !isCreditNote),
      pdfLanguage,
    };
  }

  async function persist(input: InvoiceFormInput): Promise<number> {
    if (mode === "new") {
      const createdId = await createInvoice(input);
      toast.success("Rechnung erstellt");
      return createdId;
    }
    if (id === null) throw new Error("Keine ID");
    await updateInvoice(id, input);
    toast.success("Änderungen gespeichert");
    return id;
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const customerId = Number.parseInt(customerIdStr, 10);
    if (Number.isNaN(customerId)) {
      error = "Bitte einen Kunden auswählen.";
      return;
    }
    const validationError = formError();
    if (validationError) {
      error = validationError;
      return;
    }
    saving = true;
    error = null;
    try {
      push(`/invoices/${await persist(buildInput(customerId))}`);
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }
</script>

<header class="mb-6">
  <BackLink href="/invoices">Rechnungen</BackLink>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">
    {#if isCreditNote}
      Stornorechnung bearbeiten
    {:else if mode === "new"}
      Neue Rechnung
    {:else}
      Rechnung bearbeiten
    {/if}
  </h1>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if loadError}
  <p class="text-sm text-destructive">{loadError}</p>
{:else}
  {#if isCreditNote}
    <Card class="border-warning/40 bg-warning/10 mb-4">
      <CardContent>
        <div class="flex items-start gap-3">
          <AlertTriangle class="size-5 text-warning shrink-0 mt-0.5" />
          <div class="flex-1 text-sm">
            <div class="font-medium text-warning">Stornorechnung</div>
            <div class="mt-0.5 text-muted-foreground">
              Mengen anpassen für Teilstorno. Positionen entfernen für Teilrückerstattung.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

  <form onsubmit={onSubmit} class="space-y-6">
    <Card>
      <CardContent>
        <section class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Kunde <span class="text-destructive">*</span></Label>
            <Select
              bind:value={customerIdStr}
              items={reference.customerItems}
              placeholder="— bitte wählen —"
              disabled={isCreditNote}
            />
            {#if isCreditNote}
              <p class="text-xs text-muted-foreground">
                Kunde ist an die Originalrechnung gebunden und kann nicht geändert werden.
              </p>
            {/if}
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>{isCreditNote ? "Stornodatum" : "Rechnungsdatum"}</Label>
            <DatePicker bind:value={issueDateIso} required />
          </div>
          {#if !isCreditNote}
            <div class="flex flex-col gap-1.5">
              <Label>Fällig am</Label>
              <DatePicker bind:value={dueDateIso} required />
            </div>
          {/if}
          <ServicePeriodField
            bind:mode={serviceMode}
            bind:deliveryDateIso
            bind:startIso={servicePeriodStartIso}
            bind:endIso={servicePeriodEndIso}
          />
          <CurrencyFields bind:currency bind:exchangeRate totalCent={totals.total} />
          {#if !isCreditNote}
            <ReverseChargeField
              bind:type={reverseChargeType}
              bind:supplyKind
              {settings}
              customer={reference.selectedCustomer}
            />
          {/if}
        </section>
      </CardContent>
    </Card>

    <LineItemsEditor bind:items {currency} {vatExempt} {totals} language={pdfLanguage} />

    <Card>
      <CardContent class="space-y-4">
        <PdfLanguageSelect bind:value={pdfLanguage}>
          Labels und Hinweistexte auf der PDF. Das eingebettete ZUGFeRD-XML
          ist sprach-neutral und bleibt unverändert.
        </PdfLanguageSelect>

        {#if !isCreditNote}
          <div class="flex flex-col gap-1.5">
            <Label>Zahlungsbedingungen</Label>
            <Textarea rows={2} bind:value={paymentTerms} />
          </div>

          <SkontoFields bind:skonto>
            {#snippet hint()}
              Wird strukturiert im ZUGFeRD-XML (BT-20) und als Textzeile auf der PDF ausgewiesen.
            {/snippet}
          </SkontoFields>
        {/if}
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
      <Button type="button" onclick={() => push("/invoices")} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
