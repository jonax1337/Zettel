<script lang="ts">
  import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
  import { tick, untrack } from "svelte";
  import { push, router } from "svelte-spa-router";
  import {
    createOffer,
    getOffer,
    updateOffer,
    type OfferFormInput,
  } from "$lib/db/offers";
  import type { ReverseChargeType, SupplyKind } from "$lib/db/invoices";
  import type { Customer, Offer, OfferItem, Settings } from "$lib/db/schema";
  import { offerKeepsStoredAmounts } from "./offer/offer-actions";
  import { addDaysUnix, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { computeTotals } from "$lib/utils/totals";
  import { DatePicker, PageHeader, Textarea, focusFirstInvalid, toast } from "$lib/ui";
  import { formatMoney } from "$lib/utils/currency";
  import { parseId } from "./parts/entity/edit-target";
  import AddressWindow from "./parts/editor/AddressWindow.svelte";
  import CurrencyFields from "./parts/editor/CurrencyFields.svelte";
  import CustomerPanel from "./parts/editor/CustomerPanel.svelte";
  import EditorLayout from "./parts/editor/EditorLayout.svelte";
  import EditorSaveBar from "./parts/editor/EditorSaveBar.svelte";
  import LineItemsSheet from "./parts/editor/LineItemsSheet.svelte";
  import MetaRow from "./parts/editor/MetaRow.svelte";
  import MetaText from "./parts/editor/MetaText.svelte";
  import Paper from "./parts/editor/Paper.svelte";
  import PaperField from "./parts/editor/PaperField.svelte";
  import PdfLanguageSelect from "./parts/editor/PdfLanguageSelect.svelte";
  import ReverseChargeField from "./parts/editor/ReverseChargeField.svelte";
  import ServicePeriodRows from "./parts/editor/ServicePeriodRows.svelte";
  import SkontoFields from "./parts/editor/SkontoFields.svelte";
  import { senderLine } from "./parts/editor/address-lines";
  import { documentErrors, firstError } from "./parts/editor/editor-validation";
  import { commitPendingPrices } from "./parts/editor/prices";
  import { createSaveError } from "./parts/editor/save-error.svelte";
  import { QUIET_FIELD } from "./parts/editor/quiet-field";
  import { vatExemptNote } from "./parts/editor/vat-note";
  import DetailPanel from "./invoice/detail/DetailPanel.svelte";
  import NoticeCard from "./invoice/NoticeCard.svelte";
  import { createDocumentFormData } from "./invoice/document-form.svelte";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import { vatRateForNewItem } from "$lib/utils/vat";
  import {
    lineItemsFromStored,
    newLineItem,
    toLineItemInputs,
    toTotalsItem,
    zeroVatRates,
    type LineItemForm,
  } from "./invoice/line-items";
  import { INVALID_ROUTE_ID_MESSAGE, parseRouteId } from "./invoice/route-id";
  import { preselectedCustomerId } from "./invoice/route-query";
  import {
    defaultSkontoForm,
    skontoFormFromSettings,
    skontoFormFromStored,
    skontoInput,
    type SkontoForm,
  } from "$lib/utils/skonto-form";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  /** The offer cannot be opened at all (not found, invalid id). */
  let loadError = $state<string | null>(null);
  /** Settings or customers did not load; the form stays usable for what is there. */
  let setupError = $state<string | null>(null);
  let readOnly = $state(false);
  // Problems are shown only after the first attempt to save, and then follow the form while it is fixed.
  let submitted = $state(false);
  let formElement = $state<HTMLFormElement>();
  let offerNumber = $state<string | null>(null);
  let loadedOnce = false;

  let customerIdStr = $state("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let validUntilIso = $state("");
  let notes = $state("");
  let introText = $state("");
  let reverseChargeType = $state<ReverseChargeType>("none");
  let supplyKind = $state<SupplyKind>(DEFAULT_SUPPLY_KIND);
  let serviceMode = $state<"single" | "period">("single");
  let servicePeriodStartIso = $state("");
  let servicePeriodEndIso = $state("");
  let items = $state<LineItemForm[]>([newLineItem()]);
  let currency = $state("EUR");
  let exchangeRate = $state("");
  let skonto = $state<SkontoForm>(defaultSkontoForm());
  let pdfLanguage = $state<"de" | "en">("de");

  const formState = () => ({
    customerIdStr,
    issueDateIso,
    validUntilIso,
    notes,
    introText,
    reverseChargeType,
    supplyKind,
    serviceMode,
    servicePeriodStartIso,
    servicePeriodEndIso,
    items,
    currency,
    exchangeRate,
    skonto,
    pdfLanguage,
  });
  const saveError = createSaveError(formState);

  const isReverseCharge = $derived(reverseChargeType !== "none");
  const reference = createDocumentFormData({
    customerId: () => customerIdStr,
    onLoaded: (loadedSettings, loadedCustomers) => {
      if (mode === "new") applyNewOfferDefaults(loadedSettings, loadedCustomers);
    },
    onError: (message) => (setupError = message),
  });
  const settings = $derived(reference.settings);
  const vatExempt = $derived(!!settings?.isKleinunternehmer || isReverseCharge);
  const errors = $derived(
    submitted
      ? documentErrors({
          customerId: parseId(customerIdStr),
          customer: reference.selectedCustomer,
          items,
          itemsRule: "billable",
          sender: settings,
          reverseChargeType,
          currency: { code: currency, exchangeRate },
          servicePeriod: serviceMode === "period" ? { startIso: servicePeriodStartIso, endIso: servicePeriodEndIso } : undefined,
        })
      : {},
  );
  const shownError = $derived(firstError(errors) ?? saveError.message);
  const documentTitle = $derived(mode === "new" ? "Neues Angebot" : "Angebot bearbeiten");

  const totals = $derived(
    settings
      ? computeTotals(items.map(toTotalsItem), { isKleinunternehmer: settings.isKleinunternehmer, isReverseCharge })
      : { subtotal: 0, vatAmount: 0, total: 0 },
  );

  $effect(() => {
    if (isReverseCharge) zeroVatRates(items);
  });

  // While creating, validUntil follows the issue date by the default validity.
  $effect(() => {
    if (mode !== "new" || !settings || !issueDateIso) return;
    const issueDate = fromIsoDate(issueDateIso);
    validUntilIso = toIsoDate(addDaysUnix(issueDate, settings.defaultOfferValidityDays));
  });

  // The router keeps this component mounted when only the id changes, so a second offer must not inherit the first one's state.
  $effect(() => {
    if (mode !== "edit") return;
    const offerId = parseRouteId(params?.id);
    let stale = false;
    untrack(resetForRoute);
    if (offerId === null) {
      loadError = INVALID_ROUTE_ID_MESSAGE;
      loaded = true;
      return;
    }
    id = offerId;
    getOffer(offerId)
      .then(async (res) => {
        if (stale) return;
        if (!res) {
          loadError = "Angebot nicht gefunden.";
          return;
        }
        if (res.offer.status !== "draft") readOnly = true;
        applyStoredOffer(res.offer, res.items);
        if (loadedOnce) {
          await tick();
          unsaved.markClean();
        }
      })
      .catch((e) => {
        if (!stale) loadError = String(e);
      })
      .finally(() => {
        if (stale) return;
        loaded = true;
        loadedOnce = true;
      });
    return () => {
      stale = true;
    };
  });

  function resetForRoute() {
    loaded = false;
    loadError = null;
    readOnly = false;
    submitted = false;
    saveError.clear();
    offerNumber = null;
    serviceMode = "single";
    servicePeriodStartIso = "";
    servicePeriodEndIso = "";
  }

  function applyNewOfferDefaults(s: Settings, availableCustomers: Customer[]) {
    customerIdStr = preselectedCustomerId(router.querystring, availableCustomers);
    for (const item of items) item.vatRate = vatRateForNewItem(s.isKleinunternehmer);
    skonto = skontoFormFromSettings(s);
    pdfLanguage = s.defaultPdfLanguage;
  }

  function applyStoredOffer(offer: Offer, storedItems: OfferItem[]) {
    offerNumber = offer.number;
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
    items = lineItemsFromStored(storedItems, offerKeepsStoredAmounts(offer));
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
    saveError.clear();
    commitPendingPrices(items);
    submitted = true;
    const customerId = parseId(customerIdStr);
    if (customerId === null || firstError(errors)) {
      await tick();
      if (formElement) focusFirstInvalid(formElement);
      return;
    }
    saving = true;
    try {
      const savedId = await persist(buildInput(customerId));
      unsaved.markClean();
      push(`/offers/${savedId}`);
    } catch (err) {
      saveError.set(String(err));
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  function onCancel() {
    push(mode === "edit" && id !== null ? `/offers/${id}` : "/offers");
  }

  const unsaved = guardUnsavedChanges(formState, () => !loading && reference.loaded);
</script>

<PageHeader
  title={documentTitle}
  subtitle={offerNumber ? `${offerNumber} · Du schreibst direkt auf dem Blatt.` : "Du schreibst direkt auf dem Blatt. Es ist an das spätere PDF angelehnt."}
  back={{ href: "/offers", label: "Angebote" }}
/>

{#if loading}
  <p role="status" class="text-sm text-muted-foreground">Lade…</p>
{:else if loadError}
  <NoticeCard tone="destructive" title="Das Angebot lässt sich nicht bearbeiten">
    <div class="mt-0.5 text-muted-foreground">{loadError}</div>
  </NoticeCard>
{:else}
  {#if setupError}
    <NoticeCard tone="warning" title="Nicht alle Daten konnten geladen werden">
      <div class="mt-0.5 text-muted-foreground">{setupError}</div>
    </NoticeCard>
  {/if}
  {#if readOnly}
    <NoticeCard tone="warning" title="Kein Entwurf mehr">
      <div class="mt-0.5 text-muted-foreground">Dieses Angebot ist kein Entwurf mehr und kann nicht bearbeitet werden.</div>
    </NoticeCard>
  {/if}

  <form onsubmit={onSubmit} bind:this={formElement}>
    <fieldset disabled={readOnly} class="contents">
      <EditorLayout>
        {#snippet paper()}
          <Paper label={documentTitle}>
            <div class="mb-9 flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
              <AddressWindow
                senderLine={settings ? senderLine(settings) : ""}
                customerItems={reference.customerItems}
                bind:customerIdStr
                customer={reference.selectedCustomer}
                disabled={readOnly}
                error={errors.customer}
              />
              <div class="flex flex-col items-end gap-2">
                <MetaText label="Angebotsnummer" assigned={offerNumber !== null}>
                  {offerNumber ?? "wird beim Speichern vergeben"}
                </MetaText>
                <MetaRow label="Angebotsdatum">
                  <DatePicker bind:value={issueDateIso} required disabled={readOnly} class={QUIET_FIELD} />
                </MetaRow>
                <MetaRow label="Gültig bis">
                  <DatePicker bind:value={validUntilIso} required disabled={readOnly} class={QUIET_FIELD} />
                </MetaRow>
                <ServicePeriodRows
                  bind:mode={serviceMode}
                  bind:startIso={servicePeriodStartIso}
                  bind:endIso={servicePeriodEndIso}
                  optional
                  disabled={readOnly}
                  error={errors.servicePeriod}
                />
              </div>
            </div>

            <h2 class="mb-3.5 font-display text-xl font-extrabold">Angebot</h2>
            <div class="mb-5">
              <PaperField label="Einleitungstext" optional hint="Erscheint oberhalb der Positionen auf dem PDF.">
                <Textarea rows={2} bind:value={introText} disabled={readOnly} class={QUIET_FIELD} />
              </PaperField>
            </div>
            <LineItemsSheet
              bind:items
              {currency}
              {vatExempt}
              {totals}
              {readOnly}
              language={pdfLanguage}
              vatNote={vatExemptNote(!!settings?.isKleinunternehmer, reverseChargeType)}
              errors={{ items: errors.items, quantity: errors.quantity, linePeriod: errors.linePeriod }}
            />

            <div class="mt-6">
              <PaperField label="Bemerkungen" optional hint="Erscheinen auf dem Angebot.">
                <Textarea rows={3} bind:value={notes} disabled={readOnly} class={QUIET_FIELD} />
              </PaperField>
            </div>
          </Paper>
        {/snippet}

        {#snippet rail()}
          <DetailPanel title="Optionen">
            <div class="grid gap-3.5">
              <CurrencyFields
                bind:currency
                bind:exchangeRate
                totalCent={totals.total}
                disabled={readOnly}
                error={errors.exchangeRate}
              />
              <PdfLanguageSelect bind:value={pdfLanguage} disabled={readOnly} />
              <ReverseChargeField
                bind:type={reverseChargeType}
                bind:supplyKind
                sender={settings}
                customer={reference.selectedCustomer}
                disabled={readOnly}
                error={errors.reverseCharge}
              />
              <SkontoFields bind:skonto disabled={readOnly}>
                {#snippet hint()}
                  Erscheint als Hinweis auf der Angebots-PDF und wird auf die abgeleitete Rechnung übernommen.
                {/snippet}
              </SkontoFields>
            </div>
          </DetailPanel>
          {#if reference.selectedCustomer}
            <CustomerPanel customer={reference.selectedCustomer} />
          {/if}
        {/snippet}
      </EditorLayout>
    </fieldset>

    <EditorSaveBar
      submitLabel="Entwurf speichern"
      {saving}
      disabled={readOnly}
      error={shownError}
      {onCancel}
      total={formatMoney(totals.total, currency)}
    />
  </form>
{/if}
