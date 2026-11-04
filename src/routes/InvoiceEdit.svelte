<script lang="ts">
  import { push } from "svelte-spa-router";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    computeTotals,
    createInvoice,
    getInvoice,
    updateInvoice,
    type InvoiceFormInput,
    type ReverseChargeType,
    type SupplyKind,
  } from "$lib/db/invoices";
  import type { Customer, Invoice, InvoiceItem, Settings } from "$lib/db/schema";
  import { computeEurTotalCent } from "$lib/utils/currency";
  import { addDaysUnix, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { Button, Card, CardContent, DatePicker, Label, Select, Textarea, toast } from "$lib/ui";
  import { AlertTriangle, CalendarRange } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import CurrencyFields from "./invoice/CurrencyFields.svelte";
  import LineItemsEditor from "./invoice/LineItemsEditor.svelte";
  import SkontoFields from "./invoice/SkontoFields.svelte";
  import SupplyKindField from "./invoice/SupplyKindField.svelte";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import { vatRateForNewItem } from "./parts/entity/vat";
  import { exchangeRateError, linePeriodError, servicePeriodError } from "./invoice/form-validation";
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
  const PDF_LANGUAGE_ITEMS: { value: "de" | "en"; label: string }[] = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "Englisch" },
  ];
  const REVERSE_CHARGE_ITEMS: { value: ReverseChargeType; label: string }[] = [
    { value: "none", label: "Keine" },
    { value: "intra_eu", label: "Innergemeinschaftlich (EU-B2B)" },
    { value: "third_country", label: "Ausfuhrlieferung Drittland" },
  ];

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
  let referenceDataLoaded = $state(false);
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
  const vatExempt = $derived(!!settings?.isKleinunternehmer || isReverseCharge);

  const selectedCustomer = $derived(
    customerIdStr ? (customers.find((c) => String(c.id) === customerIdStr) ?? null) : null,
  );
  const customerItems = $derived(
    customers.map((c) => ({ value: String(c.id), label: `${c.customerNumber} · ${c.name}` })),
  );

  // Reverse-Charge: sender must not be Kleinunternehmer. intra_eu requires both
  // VAT-IDs; third_country (export outside EU) only requires the sender's. The
  // EU/non-EU country judgement stays with the user.
  const canReverseChargeThirdCountry = $derived(
    !!settings && !settings.isKleinunternehmer && !!settings.vatId,
  );
  const canReverseChargeIntraEu = $derived(canReverseChargeThirdCountry && !!selectedCustomer?.vatId);

  const reverseChargeBlockedReason = $derived.by(() => {
    if (!settings) return "";
    if (settings.isKleinunternehmer) return "Nicht verfügbar für Kleinunternehmer (§ 19 UStG).";
    if (!settings.vatId) return "Eigene USt-IdNr. in den Einstellungen fehlt.";
    if (reverseChargeType === "intra_eu") {
      if (!selectedCustomer) return "Erst Kunden auswählen.";
      if (!selectedCustomer.vatId) return "EU-Reverse-Charge: Kunde benötigt USt-IdNr.";
    }
    return "";
  });

  const totals = $derived(
    settings
      ? computeTotals(items, { isKleinunternehmer: settings.isKleinunternehmer, isReverseCharge })
      : { subtotal: 0, vatAmount: 0, total: 0 },
  );

  // Judged only once settings and customers are known; otherwise a stored
  // reverse-charge type would be reset before the data it depends on arrives.
  $effect(() => {
    if (!referenceDataLoaded) return;
    if (reverseChargeType === "intra_eu" && !canReverseChargeIntraEu) reverseChargeType = "none";
    if (reverseChargeType === "third_country" && !canReverseChargeThirdCountry) reverseChargeType = "none";
  });

  $effect(() => {
    if (isReverseCharge) zeroVatRates(items);
  });

  $effect(() => {
    Promise.all([loadSettings(), listCustomers()])
      .then(([loadedSettings, loadedCustomers]) => {
        settings = loadedSettings;
        customers = loadedCustomers;
        referenceDataLoaded = true;
        if (mode === "new") applyNewInvoiceDefaults(loadedSettings);
      })
      .catch((e) => (error = String(e)));
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

  function reverseChargeError(): string | null {
    if (reverseChargeType === "none") return null;
    if (settings?.isKleinunternehmer) return "Reverse-Charge ist für Kleinunternehmer nicht zulässig.";
    if (reverseChargeType === "intra_eu" && !selectedCustomer?.vatId) {
      return "EU-Reverse-Charge erfordert eine USt-IdNr. des Kunden.";
    }
    if (items.some((it) => it.vatRate !== 0)) return "Bei Reverse-Charge müssen alle Positionen 0 % USt haben.";
    return null;
  }

  function formError(): string | null {
    if (items.length === 0) return "Mindestens eine Position erforderlich.";
    return (
      reverseChargeError() ??
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
              items={customerItems}
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
          <div class="flex flex-col gap-1.5 col-span-2">
            <div class="flex items-center justify-between">
              <Label>
                {serviceMode === "period" ? "Leistungszeitraum" : "Liefer-/Leistungsdatum"}
              </Label>
              <button
                type="button"
                class="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                onclick={() => (serviceMode = serviceMode === "single" ? "period" : "single")}
              >
                <CalendarRange class="size-3.5" />
                {serviceMode === "period" ? "Auf Einzeltag wechseln" : "Auf Zeitraum wechseln"}
              </button>
            </div>
            {#if serviceMode === "period"}
              <div class="grid grid-cols-2 gap-2">
                <DatePicker bind:value={servicePeriodStartIso} />
                <DatePicker bind:value={servicePeriodEndIso} />
              </div>
              <p class="text-xs text-muted-foreground">
                EN-16931 BG-14: Rechnungszeitraum für mehrwöchige Leistungen.
              </p>
            {:else}
              <DatePicker bind:value={deliveryDateIso} />
            {/if}
          </div>
          <CurrencyFields bind:currency bind:exchangeRate totalCent={totals.total} />
          {#if settings && !settings.isKleinunternehmer && !isCreditNote}
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>Reverse-Charge</Label>
              <Select
                bind:value={reverseChargeType}
                items={REVERSE_CHARGE_ITEMS}
                disabled={!canReverseChargeThirdCountry}
              />
              <p class="text-xs text-muted-foreground">
                {#if reverseChargeType === "intra_eu"}
                  Innergemeinschaftlicher Umsatz an ein EU-Unternehmen. Alle Positionen auf 0&nbsp;% USt.
                {:else if reverseChargeType === "third_country"}
                  Umsatz an einen Kunden im Drittland. Alle Positionen auf 0&nbsp;% USt.
                {:else}
                  Inlandsumsatz oder regulärer Umsatzsteuerausweis.
                {/if}
              </p>
              {#if reverseChargeBlockedReason}
                <p class="text-xs text-warning">{reverseChargeBlockedReason}</p>
              {/if}
            </div>
            {#if reverseChargeType !== "none"}
              <SupplyKindField bind:value={supplyKind} {reverseChargeType} />
            {/if}
          {/if}
        </section>
      </CardContent>
    </Card>

    <LineItemsEditor bind:items {currency} {vatExempt} {totals} language={pdfLanguage} />

    <Card>
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-1.5 max-w-xs">
          <Label>Sprache der PDF</Label>
          <Select
            items={PDF_LANGUAGE_ITEMS}
            value={pdfLanguage}
            onValueChange={(v) => (pdfLanguage = v)}
          />
          <p class="text-xs text-muted-foreground">
            Labels und Hinweistexte auf der PDF. Das eingebettete ZUGFeRD-XML
            ist sprach-neutral und bleibt unverändert.
          </p>
        </div>

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
