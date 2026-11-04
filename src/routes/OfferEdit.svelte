<script lang="ts">
  import { push } from "svelte-spa-router";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    computeTotals,
    createOffer,
    getOffer,
    updateOffer,
    type OfferFormInput,
  } from "$lib/db/offers";
  import type { ReverseChargeType, SupplyKind } from "$lib/db/invoices";
  import type { Customer, Offer, OfferItem, Settings } from "$lib/db/schema";
  import { addDaysUnix, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { Button, Card, CardContent, DatePicker, Label, Select, Textarea, toast } from "$lib/ui";
  import { CalendarRange } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import CurrencyFields from "./invoice/CurrencyFields.svelte";
  import LineItemsEditor from "./invoice/LineItemsEditor.svelte";
  import SkontoFields from "./invoice/SkontoFields.svelte";
  import SupplyKindField from "./invoice/SupplyKindField.svelte";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import { vatRateForNewItem } from "./parts/entity/vat";
  import {
    REVERSE_CHARGE_HINTS,
    REVERSE_CHARGE_ITEMS,
    reverseChargeBlockedReason,
  } from "./parts/entity/reverse-charge";
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

  const PDF_LANGUAGE_ITEMS: { value: "de" | "en"; label: string }[] = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "Englisch" },
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
  let readOnly = $state(false);

  let customerIdStr = $state("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let validUntilIso = $state("");
  let notes = $state("");
  let introText = $state("");
  let reverseChargeType = $state<ReverseChargeType>("none");
  let supplyKind = $state<SupplyKind>(DEFAULT_SUPPLY_KIND);
  let serviceMode = $state<"none" | "period">("none");
  let servicePeriodStartIso = $state("");
  let servicePeriodEndIso = $state("");
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

  const blockedReason = $derived(
    reverseChargeBlockedReason(reverseChargeType, settings, selectedCustomer),
  );

  const totals = $derived(
    settings
      ? computeTotals(items, { isKleinunternehmer: settings.isKleinunternehmer, isReverseCharge })
      : { subtotal: 0, vatAmount: 0, total: 0 },
  );

  // Judged only once settings and customers are known; otherwise a stored
  // reverse-charge type would be reset before the data it depends on arrives.
  $effect(() => {
    if (referenceDataLoaded && blockedReason) reverseChargeType = "none";
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
        if (mode === "new") applyNewOfferDefaults(loadedSettings);
      })
      .catch((e) => (error = String(e)));
  });

  // While creating, validUntil follows the issue date by the default validity.
  $effect(() => {
    if (mode !== "new" || !settings || !issueDateIso) return;
    const issueDate = fromIsoDate(issueDateIso);
    validUntilIso = toIsoDate(addDaysUnix(issueDate, settings.defaultOfferValidityDays));
  });

  $effect(() => {
    if (mode !== "edit") return;
    const offerId = parseRouteId(params?.id);
    if (offerId === null) {
      loadError = INVALID_ROUTE_ID_MESSAGE;
      loaded = true;
      return;
    }
    id = offerId;
    getOffer(offerId)
      .then((res) => {
        if (!res) {
          loadError = "Angebot nicht gefunden.";
          return;
        }
        if (res.offer.status !== "draft") {
          readOnly = true;
          error = "Nur Entwürfe können bearbeitet werden.";
        }
        applyStoredOffer(res.offer, res.items);
      })
      .catch((e) => (loadError = String(e)))
      .finally(() => (loaded = true));
  });

  function applyNewOfferDefaults(s: Settings) {
    for (const item of items) item.vatRate = vatRateForNewItem(s.isKleinunternehmer);
    skonto = skontoFormFromSettings(s);
    pdfLanguage = s.defaultPdfLanguage;
  }

  function applyStoredOffer(offer: Offer, storedItems: OfferItem[]) {
    customerIdStr = String(offer.customerId);
    issueDateIso = toIsoDate(offer.issueDate);
    validUntilIso = toIsoDate(offer.validUntil);
    notes = offer.notes ?? "";
    introText = offer.introText ?? "";
    reverseChargeType = offer.reverseChargeType;
    supplyKind = offer.supplyKind;
    currency = offer.currency;
    exchangeRate = offer.exchangeRate ?? "";
    skonto = skontoFormFromStored(offer.skontoPercent, offer.skontoDays);
    pdfLanguage = offer.pdfLanguage;
    if (offer.servicePeriodStart && offer.servicePeriodEnd) {
      serviceMode = "period";
      servicePeriodStartIso = toIsoDate(offer.servicePeriodStart);
      servicePeriodEndIso = toIsoDate(offer.servicePeriodEnd);
    }
    items = storedItems.map(lineItemFromStored);
  }

  function reverseChargeError(): string | null {
    return blockedReason ? `Reverse-Charge: ${blockedReason}` : null;
  }

  function formError(): string | null {
    const hasBillableItem = items.some((it) => it.description.trim() !== "" && it.unitPrice > 0);
    if (!hasBillableItem) return "Mindestens eine Position mit Beschreibung und Preis erforderlich.";
    return (
      reverseChargeError() ??
      exchangeRateError(currency, exchangeRate) ??
      (serviceMode === "period" ? servicePeriodError(servicePeriodStartIso, servicePeriodEndIso) : null) ??
      linePeriodError(items)
    );
  }

  function buildInput(customerId: number): OfferFormInput {
    const usesPeriod = serviceMode === "period";
    return {
      customerId,
      issueDate: fromIsoDate(issueDateIso),
      validUntil: fromIsoDate(validUntilIso),
      notes: notes.trim() || null,
      introText: introText.trim() || null,
      reverseChargeType,
      supplyKind,
      items: toLineItemInputs(items),
      currency,
      exchangeRate: currency === "EUR" ? null : exchangeRate.trim(),
      servicePeriodStart: usesPeriod ? fromIsoDate(servicePeriodStartIso) : null,
      servicePeriodEnd: usesPeriod ? fromIsoDate(servicePeriodEndIso) : null,
      ...skontoInput(skonto),
      pdfLanguage,
    };
  }

  async function persist(input: OfferFormInput): Promise<number> {
    if (mode === "new") {
      const createdId = await createOffer(input);
      toast.success("Angebot erstellt");
      return createdId;
    }
    if (id === null) throw new Error("Keine ID");
    await updateOffer(id, input);
    toast.success("Änderungen gespeichert");
    return id;
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (readOnly) return;
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
      push(`/offers/${await persist(buildInput(customerId))}`);
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  function onCancel() {
    push(mode === "edit" && id !== null ? `/offers/${id}` : "/offers");
  }
</script>

<header class="mb-6">
  <BackLink href="/offers">Angebote</BackLink>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">
    {mode === "new" ? "Neues Angebot" : "Angebot bearbeiten"}
  </h1>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if loadError}
  <p class="text-sm text-destructive">{loadError}</p>
{:else}
  {#if readOnly}
    <Card class="border-warning/40 bg-warning/5 mb-4">
      <CardContent>
        <p class="text-sm">Dieses Angebot ist kein Entwurf mehr und kann nicht bearbeitet werden.</p>
      </CardContent>
    </Card>
  {/if}

  <form onsubmit={onSubmit} class="space-y-6">
    <Card>
      <CardContent>
        <fieldset disabled={readOnly} class="contents">
          <section class="grid grid-cols-2 gap-4">
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>Kunde <span class="text-destructive">*</span></Label>
              <Select
                bind:value={customerIdStr}
                items={customerItems}
                placeholder="— bitte wählen —"
                disabled={readOnly}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Angebotsdatum</Label>
              <DatePicker bind:value={issueDateIso} required disabled={readOnly} />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Gültig bis</Label>
              <DatePicker bind:value={validUntilIso} required disabled={readOnly} />
            </div>
            <div class="col-span-2 flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <Label>Leistungszeitraum (optional)</Label>
                <button
                  type="button"
                  class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  onclick={() => (serviceMode = serviceMode === "period" ? "none" : "period")}
                  disabled={readOnly}
                >
                  <CalendarRange class="size-3.5" />
                  {serviceMode === "period" ? "Entfernen" : "Hinzufügen"}
                </button>
              </div>
              {#if serviceMode === "period"}
                <div class="grid grid-cols-2 gap-2">
                  <DatePicker bind:value={servicePeriodStartIso} disabled={readOnly} />
                  <DatePicker bind:value={servicePeriodEndIso} disabled={readOnly} />
                </div>
                <p class="text-xs text-muted-foreground">EN-16931 BG-14 — mehrwöchige Leistungen.</p>
              {/if}
            </div>
            <CurrencyFields bind:currency bind:exchangeRate totalCent={totals.total} disabled={readOnly} />
            {#if settings && !settings.isKleinunternehmer}
              <div class="col-span-2 flex flex-col gap-1.5">
                <Label>Reverse-Charge</Label>
                <Select
                  bind:value={reverseChargeType}
                  items={REVERSE_CHARGE_ITEMS}
                  disabled={!settings.vatId || readOnly}
                />
                <p class="text-xs text-muted-foreground">{REVERSE_CHARGE_HINTS[reverseChargeType]}</p>
                {#if blockedReason}
                  <p class="text-xs text-warning">{blockedReason}</p>
                {/if}
              </div>
              {#if reverseChargeType !== "none"}
                <SupplyKindField bind:value={supplyKind} {reverseChargeType} disabled={readOnly} />
              {/if}
            {/if}
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>Einleitungstext (optional)</Label>
              <Textarea
                rows={3}
                bind:value={introText}
                disabled={readOnly}
                placeholder="Erscheint oberhalb der Positionen auf dem PDF."
              />
            </div>
          </section>
        </fieldset>
      </CardContent>
    </Card>

    <LineItemsEditor
      bind:items
      {currency}
      {vatExempt}
      {totals}
      {readOnly}
      language={pdfLanguage}
    />

    <Card>
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-1.5 max-w-xs">
          <Label>Sprache der PDF</Label>
          <Select
            items={PDF_LANGUAGE_ITEMS}
            value={pdfLanguage}
            onValueChange={(v) => (pdfLanguage = v)}
            disabled={readOnly}
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <Label>Bemerkungen (erscheinen auf dem Angebot)</Label>
          <Textarea rows={3} bind:value={notes} disabled={readOnly} />
        </div>

        <SkontoFields bind:skonto disabled={readOnly}>
          {#snippet hint()}
            Erscheint als Hinweis auf der Angebots-PDF und wird auf die abgeleitete Rechnung übernommen.
          {/snippet}
        </SkontoFields>
      </CardContent>
    </Card>

    <div class="flex items-center gap-3">
      <Button type="submit" disabled={saving || readOnly}>
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </Button>
      <Button type="button" onclick={onCancel} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
