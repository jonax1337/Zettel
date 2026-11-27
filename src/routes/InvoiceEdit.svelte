<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
  import { tick, untrack } from "svelte";
  import { push, router } from "svelte-spa-router";
  import {
    createInvoice,
    getInvoice,
    updateInvoice,
    type InvoiceFormInput,
    type ReverseChargeType,
    type SupplyKind,
  } from "$lib/db/invoices";
  import { keepsStoredAmounts } from "$lib/db/invoice-lifecycle";
  import type { Customer, Invoice, InvoiceItem, Settings } from "$lib/db/schema";
  import { computeEurTotalCent, formatMoney } from "$lib/utils/currency";
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { defaultPaymentTermsText } from "$lib/utils/payment-terms";
  import { computeTotals } from "$lib/utils/totals";
  import {
    followCustomerLeitweg,
    normalizeBuyerReference,
    type FollowedLeitweg,
  } from "$lib/xrechnung/buyer-reference";
  import { DatePicker, Field, Input, PageHeader, Textarea, focusFirstInvalid, toast, Panel } from "$lib/ui";
  import { displayInvoiceNumber } from "$lib/utils/invoice-number";
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
  import { assignedInvoiceNumber } from "./parts/editor/document-number";
  import { documentErrors, firstError } from "./parts/editor/editor-validation";
  import { commitPendingPrices } from "./parts/editor/prices";
  import { createSaveError } from "./parts/editor/save-error.svelte";
  import { QUIET_FIELD } from "./parts/editor/quiet-field";
  import { vatExemptNote } from "./parts/editor/vat-note";
  import NoticeCard from "./invoice/NoticeCard.svelte";
  import { createDocumentFormData } from "./invoice/document-form.svelte";
  import { dueDateFromIssue, followDerivedDueDate } from "./invoice/due-date";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import { vatRateForNewItem } from "$lib/utils/vat";
  import {
    lineItemsFromStored,
    newLineItem,
    toLineItemInputs,
    toTotalsItem,
    type LineItemForm,
  } from "./invoice/line-items";
  import { restoreVatRates, zeroVatRatesRemembering, type VatRateSnapshot } from "./invoice/reverse-charge";
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
  /** The invoice cannot be edited at all (not found, not a draft). */
  let loadError = $state<string | null>(null);
  /** Settings or customers did not load; the form stays usable for what is there. */
  let setupError = $state<string | null>(null);
  // Problems are shown only after the first attempt to save, and then follow the form while it is fixed.
  let submitted = $state(false);
  let formElement = $state<HTMLFormElement>();
  let draftLabel = $state<string | null>(null);
  /** The number a reopened draft already carries; null while it only has the draft placeholder. */
  let invoiceNumber = $state<string | null>(null);
  let loadedOnce = false;

  let customerIdStr = $state("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let serviceMode = $state<"single" | "period">("single");
  let deliveryDateIso = $state("");
  let servicePeriodStartIso = $state("");
  let servicePeriodEndIso = $state("");
  let dueDateIso = $state("");
  // Last due date derived from issue date + payment terms; a due date that differs was chosen by the user.
  let derivedDueDateIso = "";
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
  let buyerReference = $state("");
  // The customer whose Leitweg-ID the field currently follows; a different buyer reference was entered by the user.
  let followedLeitweg: FollowedLeitweg = { customerId: null, leitwegId: "" };

  // A stored invoice keeps the Kleinunternehmer status it was created with, whatever the settings say now.
  let storedKleinunternehmer = $state<boolean | null>(null);
  const vatRateSnapshot: VatRateSnapshot = new Map();

  const formState = () => ({
    customerIdStr,
    issueDateIso,
    serviceMode,
    deliveryDateIso,
    servicePeriodStartIso,
    servicePeriodEndIso,
    dueDateIso,
    notes,
    paymentTerms,
    reverseChargeType,
    supplyKind,
    isCreditNote,
    items,
    currency,
    exchangeRate,
    skonto,
    pdfLanguage,
    buyerReference,
  });
  const saveError = createSaveError(formState);

  const isReverseCharge = $derived(reverseChargeType !== "none");
  const reference = createDocumentFormData({
    customerId: () => customerIdStr,
    onLoaded: (loadedSettings, loadedCustomers) => {
      if (mode === "new") applyNewInvoiceDefaults(loadedSettings, loadedCustomers);
    },
    onError: (message) => (setupError = message),
  });
  const settings = $derived(reference.settings);
  const isKleinunternehmer = $derived(storedKleinunternehmer ?? settings?.isKleinunternehmer ?? false);
  const vatExempt = $derived(isKleinunternehmer || isReverseCharge);
  const reverseChargeSender = $derived(settings ? { isKleinunternehmer, vatId: settings.vatId } : null);
  const errors = $derived(
    submitted
      ? documentErrors({
          customerId: parseId(customerIdStr),
          customer: reference.selectedCustomer,
          items,
          itemsRule: "any",
          sender: reverseChargeSender,
          reverseChargeType,
          currency: { code: currency, exchangeRate },
          servicePeriod: serviceMode === "period" ? { startIso: servicePeriodStartIso, endIso: servicePeriodEndIso } : undefined,
        })
      : {},
  );
  const shownError = $derived(firstError(errors) ?? saveError.message);

  const totals = $derived(
    settings ? computeTotals(items.map(toTotalsItem), { isKleinunternehmer, isReverseCharge }) : { subtotal: 0, vatAmount: 0, total: 0 },
  );

  // Reverse charge forces 0 % VAT; the rates come back when it is switched off again.
  $effect(() => {
    if (isReverseCharge) zeroVatRatesRemembering(items, vatRateSnapshot);
    else if (vatRateSnapshot.size > 0) restoreVatRates(items, vatRateSnapshot);
  });

  $effect(() => {
    if (!settings || loading) return;
    const nextDerived = dueDateFromIssue(issueDateIso, settings.defaultPaymentTermsDays);
    untrack(() => {
      dueDateIso = followDerivedDueDate(dueDateIso, derivedDueDateIso, nextDerived);
      derivedDueDateIso = nextDerived;
    });
  });

  $effect(() => {
    const customer = reference.selectedCustomer;
    const next = { customerId: customer?.id ?? null, leitwegId: customer?.leitwegId ?? "" };
    untrack(() => {
      const followed = followCustomerLeitweg(buyerReference, followedLeitweg, next);
      buyerReference = followed.value;
      followedLeitweg = followed.followed;
    });
  });

  // The router keeps this component mounted when only the id changes, so a second invoice must not inherit the first one's state.
  $effect(() => {
    if (mode !== "edit") return;
    const invoiceId = parseRouteId(params?.id);
    let stale = false;
    untrack(resetForRoute);
    if (invoiceId === null) {
      loadError = INVALID_ROUTE_ID_MESSAGE;
      loaded = true;
      return;
    }
    id = invoiceId;
    getInvoice(invoiceId)
      .then(async (res) => {
        if (stale) return;
        if (!res) loadError = "Rechnung nicht gefunden.";
        else if (res.invoice.status !== "draft") loadError = "Nur Entwürfe können bearbeitet werden.";
        else {
          draftLabel = displayInvoiceNumber(res.invoice);
          invoiceNumber = assignedInvoiceNumber(res.invoice.number);
          applyStoredInvoice(res.invoice, res.items);
          if (loadedOnce) {
            await tick();
            unsaved.markClean();
          }
        }
      })
      .catch((e) => {
        if (!stale) loadError = errorMessage(e);
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
    submitted = false;
    saveError.clear();
    draftLabel = null;
    invoiceNumber = null;
    storedKleinunternehmer = null;
    isCreditNote = false;
    serviceMode = "single";
    deliveryDateIso = "";
    servicePeriodStartIso = "";
    servicePeriodEndIso = "";
    vatRateSnapshot.clear();
  }

  function applyNewInvoiceDefaults(s: Settings, availableCustomers: Customer[]) {
    customerIdStr = preselectedCustomerId(router.querystring, availableCustomers);
    paymentTerms = defaultPaymentTermsText(s.defaultPaymentTermsDays);
    for (const item of items) item.vatRate = vatRateForNewItem(s.isKleinunternehmer);
    skonto = skontoFormFromSettings(s);
    pdfLanguage = s.defaultPdfLanguage;
  }

  function applyStoredInvoice(invoice: Invoice, storedItems: InvoiceItem[]) {
    storedKleinunternehmer = invoice.isKleinunternehmer;
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
    buyerReference = invoice.buyerReference ?? "";
    followedLeitweg = { customerId: invoice.customerId, leitwegId: buyerReference };
    items = lineItemsFromStored(storedItems, keepsStoredAmounts(invoice));
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
      buyerReference: normalizeBuyerReference(buyerReference),
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
      push(`/invoices/${savedId}`);
    } catch (err) {
      saveError.set(errorMessage(err));
      toast.error("Speichern fehlgeschlagen", errorMessage(err));
    } finally {
      saving = false;
    }
  }

  const unsaved = guardUnsavedChanges(formState, () => !loading && reference.loaded);

  const documentTitle = $derived(
    isCreditNote ? "Stornorechnung bearbeiten" : mode === "new" ? "Neue Rechnung" : "Rechnung bearbeiten",
  );
</script>

<PageHeader
  title={documentTitle}
  subtitle={draftLabel ? `${draftLabel} · Du schreibst direkt auf dem Blatt.` : "Du schreibst direkt auf dem Blatt. Es ist an das spätere PDF angelehnt."}
  back={{ href: "/invoices", label: "Rechnungen" }}
/>

{#if loading}
  <p role="status" class="text-sm text-muted-foreground">Lade…</p>
{:else if loadError}
  <NoticeCard tone="destructive" title="Die Rechnung lässt sich nicht bearbeiten">
    <div class="mt-0.5 text-muted-foreground">{loadError}</div>
  </NoticeCard>
{:else}
  {#if setupError}
    <NoticeCard tone="warning" title="Nicht alle Daten konnten geladen werden">
      <div class="mt-0.5 text-muted-foreground">{setupError}</div>
    </NoticeCard>
  {/if}
  {#if isCreditNote}
    <NoticeCard tone="warning" title="Stornorechnung">
      <div class="mt-0.5 text-muted-foreground">
        Passe die Mengen für einen Teilstorno an. Entferne Positionen für eine Teilrückerstattung.
      </div>
    </NoticeCard>
  {/if}

  <form onsubmit={onSubmit} bind:this={formElement}>
    <EditorLayout>
      {#snippet paper()}
        <Paper label={documentTitle}>
          <div class="mb-9 flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
            <AddressWindow
              senderLine={settings ? senderLine(settings) : ""}
              customerItems={reference.customerItems}
              bind:customerIdStr
              customer={reference.selectedCustomer}
              disabled={isCreditNote}
              error={errors.customer}
              lockedNote={isCreditNote ? "Der Kunde ist an die Originalrechnung gebunden." : undefined}
            />
            <div class="flex flex-col items-end gap-2">
              <MetaText label="Rechnungsnummer" assigned={invoiceNumber !== null}>
                {invoiceNumber ?? "wird beim Ausstellen vergeben"}
              </MetaText>
              <MetaRow label={isCreditNote ? "Stornodatum" : "Rechnungsdatum"}>
                <DatePicker bind:value={issueDateIso} required class={QUIET_FIELD} />
              </MetaRow>
              <ServicePeriodRows
                bind:mode={serviceMode}
                bind:deliveryDateIso
                bind:startIso={servicePeriodStartIso}
                bind:endIso={servicePeriodEndIso}
                error={errors.servicePeriod}
              />
              {#if !isCreditNote}
                <MetaRow label="Fällig am">
                  <DatePicker bind:value={dueDateIso} required class={QUIET_FIELD} />
                </MetaRow>
              {/if}
            </div>
          </div>

          <h2 class="mb-3.5 font-display text-xl font-extrabold">{isCreditNote ? "Stornorechnung" : "Rechnung"}</h2>
          <LineItemsSheet
            bind:items
            {currency}
            {vatExempt}
            {totals}
            language={pdfLanguage}
            vatNote={vatExemptNote(isKleinunternehmer, reverseChargeType)}
            errors={{ items: errors.items, quantity: errors.quantity, linePeriod: errors.linePeriod }}
          />

          <div class="mt-6 grid gap-5">
            {#if !isCreditNote}
              <PaperField label="Zahlungsbedingungen">
                <Textarea rows={2} bind:value={paymentTerms} class={QUIET_FIELD} />
              </PaperField>
            {/if}
            <PaperField label="Fußtext" optional>
              <Textarea
                rows={2}
                bind:value={notes}
                placeholder="Zum Beispiel ein Dank oder ein Hinweis zur Leistung"
                class={QUIET_FIELD}
              />
            </PaperField>
          </div>
        </Paper>
      {/snippet}

      {#snippet rail()}
        <Panel title="Optionen">
          <div class="grid gap-3.5">
            <CurrencyFields
              bind:currency
              bind:exchangeRate
              totalCent={totals.total}
              disabled={isCreditNote}
              error={errors.exchangeRate}
            />
            <PdfLanguageSelect bind:value={pdfLanguage}>
              Labels und Hinweistexte auf der PDF. Das eingebettete ZUGFeRD-XML ist sprachneutral und bleibt unverändert.
            </PdfLanguageSelect>
            <!-- A Storno keeps the reverse-charge type of the invoice it corrects. -->
            {#if !isCreditNote}
              <ReverseChargeField
                bind:type={reverseChargeType}
                bind:supplyKind
                sender={reverseChargeSender}
                customer={reference.selectedCustomer}
                error={errors.reverseCharge}
              />
              <SkontoFields bind:skonto>
                {#snippet hint()}
                  Wird strukturiert im ZUGFeRD-XML (BT-20) und als Textzeile auf der PDF ausgewiesen.
                {/snippet}
              </SkontoFields>
            {/if}
            {#if reference.selectedCustomer?.receivesXrechnung || buyerReference}
              <Field
                label="Leitweg-ID / Käuferreferenz"
                hint="Pflicht für XRechnungen. Kommt vom Kunden und kann pro Rechnung überschrieben werden."
              >
                <Input bind:value={buyerReference} placeholder="z. B. 04011000-1234512345-35" />
              </Field>
            {/if}
          </div>
        </Panel>
        {#if reference.selectedCustomer}
          <CustomerPanel customer={reference.selectedCustomer} />
        {/if}
      {/snippet}
    </EditorLayout>

    <EditorSaveBar
      submitLabel="Entwurf speichern"
      {saving}
      error={shownError}
      onCancel={() => push(mode === "edit" && id !== null ? `/invoices/${id}` : "/invoices")}
      total={formatMoney(totals.total, currency)}
    />
  </form>
{/if}
