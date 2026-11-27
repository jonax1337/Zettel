<script lang="ts">
  import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
  import { tick, untrack } from "svelte";
  import { push, router } from "svelte-spa-router";
  import { intQueryParam } from "./invoice/route-query";
  import {
    createRecurring,
    getRecurring,
    templatePrefillRejection,
    updateRecurring,
    type RecurringFormInput,
  } from "$lib/db/recurring";
  import { getInvoice, type ReverseChargeType, type SupplyKind } from "$lib/db/invoices";
  import type { RecurringInterval, Settings } from "$lib/db/schema";
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { computeTotals } from "$lib/utils/totals";
  import { CheckField, DatePicker, Field, Input, PageHeader, Select, Textarea, focusFirstInvalid, toast } from "$lib/ui";
  import { formatMoney } from "$lib/utils/currency";
  import { fetchEditTarget, parseId } from "./parts/entity/edit-target";
  import { RECURRING_INTERVAL_ITEMS } from "./parts/entity/recurring";
  import AddressWindow from "./parts/editor/AddressWindow.svelte";
  import CustomerPanel from "./parts/editor/CustomerPanel.svelte";
  import EditorLayout from "./parts/editor/EditorLayout.svelte";
  import EditorSaveBar from "./parts/editor/EditorSaveBar.svelte";
  import LineItemsSheet from "./parts/editor/LineItemsSheet.svelte";
  import MetaRow from "./parts/editor/MetaRow.svelte";
  import MetaText from "./parts/editor/MetaText.svelte";
  import Paper from "./parts/editor/Paper.svelte";
  import PaperField from "./parts/editor/PaperField.svelte";
  import ReverseChargeField from "./parts/editor/ReverseChargeField.svelte";
  import { senderLine } from "./parts/editor/address-lines";
  import { documentErrors, firstError } from "./parts/editor/editor-validation";
  import { commitPendingPrices } from "./parts/editor/prices";
  import { createSaveError } from "./parts/editor/save-error.svelte";
  import { QUIET_FIELD } from "./parts/editor/quiet-field";
  import { vatExemptNote } from "./parts/editor/vat-note";
  import DetailPanel from "./invoice/detail/DetailPanel.svelte";
  import NoticeCard from "./invoice/NoticeCard.svelte";
  import { vatRateForNewItem } from "$lib/utils/vat";
  import { createDocumentFormData } from "./invoice/document-form.svelte";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import {
    lineItemFromStored,
    lineItemsFromStored,
    newLineItem,
    toLineItemInputs,
    zeroVatRates,
    type LineItemForm,
  } from "./invoice/line-items";
  import { paymentTermDays } from "./parts/recurring/payment-term-days";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  const fromInvoiceId = $derived(
    mode === "new" ? intQueryParam(router.querystring, "fromInvoice") : null,
  );

  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  /** The template cannot be opened at all (not found, invalid id). */
  let loadError = $state<string | null>(null);
  /** Settings or customers did not load; the form stays usable for what is there. */
  let setupError = $state<string | null>(null);
  let formElement = $state<HTMLFormElement>();
  let loadedOnce = false;
  /** Why the invoice the template was meant to start from cannot be used. */
  let prefillNotice = $state<string | null>(null);
  // Problems are shown only after the first attempt to save, and then follow the form while it is fixed.
  let submitted = $state(false);

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

  const formState = () => ({
    name,
    customerIdStr,
    interval,
    startDateIso,
    paymentTermsDays,
    reverseChargeType,
    supplyKind,
    active,
    notes,
    paymentTerms,
    items,
  });
  const saveError = createSaveError(formState);

  const isReverseCharge = $derived(reverseChargeType !== "none");
  const reference = createDocumentFormData({
    customerId: () => customerIdStr,
    onLoaded: async (loadedSettings) => {
      if (mode === "new") await prepareNewTemplate(loadedSettings);
    },
    onError: (message) => (setupError = message),
  });
  const settings = $derived(reference.settings);
  const vatExempt = $derived(!!settings?.isKleinunternehmer || isReverseCharge);
  const errors = $derived(
    submitted
      ? documentErrors({
          name,
          customerId: parseId(customerIdStr),
          customer: reference.selectedCustomer,
          items,
          itemsRule: "any",
          sender: settings,
          reverseChargeType,
        })
      : {},
  );
  const shownError = $derived(firstError(errors) ?? saveError.message);
  const documentTitle = $derived(mode === "new" ? "Neue wiederkehrende Rechnung" : "Wiederkehrende Rechnung bearbeiten");

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
    const rejection = templatePrefillRejection(invoice);
    if (rejection) {
      prefillNotice = rejection;
      return;
    }
    customerIdStr = String(invoice.customerId);
    reverseChargeType = invoice.reverseChargeType;
    supplyKind = invoice.supplyKind;
    paymentTerms = invoice.paymentTerms ?? "";
    paymentTermsDays = paymentTermDays(
      invoice.issueDate,
      invoice.dueDate,
      loadedSettings.defaultPaymentTermsDays,
    );
    // A template computes its amounts anew for every invoice it creates.
    if (source.items.length > 0) items = lineItemsFromStored(source.items, false);
    startDateIso = "";
  }

  // The router keeps this component mounted when only the id changes, so a second template must not inherit the first one's state.
  $effect(() => {
    if (mode !== "edit") return;
    const routeId = params?.id;
    let stale = false;
    untrack(resetForRoute);
    fetchEditTarget(routeId, getRecurring, "Wiederkehrende Rechnung nicht gefunden.")
      .then(async (target) => {
        if (stale) return;
        if ("error" in target) {
          loadError = target.error;
          return;
        }
        id = target.id;
        applyTemplate(target.value);
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
    submitted = false;
    saveError.clear();
  }

  function applyTemplate({ recurring, items: storedItems }: NonNullable<Awaited<ReturnType<typeof getRecurring>>>) {
    name = recurring.name;
    customerIdStr = String(recurring.customerId);
    interval = recurring.interval;
    startDateIso = toIsoDate(recurring.startDate);
    paymentTermsDays = recurring.paymentTermsDays;
    reverseChargeType = recurring.reverseChargeType;
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
      reverseChargeType,
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
      toast.success("Wiederkehrende Rechnung erstellt");
    } else if (id !== null) {
      await updateRecurring(id, input);
      toast.success("Änderungen gespeichert");
    } else {
      throw new Error("Keine ID");
    }
  }

  async function save(input: RecurringFormInput) {
    saving = true;
    try {
      await persist(input);
      unsaved.markClean();
      push("/recurring");
    } catch (err) {
      saveError.set(String(err));
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
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
    await save(buildInput(customerId));
  }

  const unsaved = guardUnsavedChanges(formState, () => !loading && reference.loaded);
</script>

<PageHeader
  title={documentTitle}
  subtitle="Die Vorlage hat dieselbe Form wie die Rechnungen, die daraus entstehen."
  back={{ href: "/recurring", label: "Wiederkehrende Rechnungen" }}
/>

{#if loading}
  <p role="status" class="text-sm text-muted-foreground">Lade…</p>
{:else if loadError}
  <NoticeCard tone="destructive" title="Die Vorlage lässt sich nicht bearbeiten">
    <div class="mt-0.5 text-muted-foreground">{loadError}</div>
  </NoticeCard>
{:else}
  {#if setupError}
    <NoticeCard tone="warning" title="Nicht alle Daten konnten geladen werden">
      <div class="mt-0.5 text-muted-foreground">{setupError}</div>
    </NoticeCard>
  {/if}
  {#if prefillNotice}
    <NoticeCard tone="warning" title="Aus dieser Rechnung lässt sich keine Vorlage machen">
      <div class="mt-0.5 text-muted-foreground">{prefillNotice}</div>
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
              error={errors.customer}
            />
            <div class="flex flex-col items-end gap-2">
              <MetaText label="Rechnungsnummer">wird bei jeder Rechnung neu vergeben</MetaText>
              <MetaRow label="Zahlungsfrist (Tage)">
                <Input type="number" min="0" bind:value={paymentTermsDays} class={QUIET_FIELD} />
              </MetaRow>
            </div>
          </div>

          <h2 class="mb-3.5 font-display text-xl font-extrabold">Rechnung</h2>
          <LineItemsSheet
            bind:items
            currency="EUR"
            {vatExempt}
            {totals}
            language="de"
            totalLabel="Betrag je Rechnung"
            vatNote={vatExemptNote(!!settings?.isKleinunternehmer, reverseChargeType)}
            errors={{ items: errors.items, quantity: errors.quantity, linePeriod: errors.linePeriod }}
          />

          <div class="mt-6 grid gap-5">
            <PaperField label="Zahlungsbedingungen">
              <Textarea rows={2} bind:value={paymentTerms} class={QUIET_FIELD} />
            </PaperField>
            <PaperField label="Fußtext" optional>
              <Textarea rows={2} bind:value={notes} class={QUIET_FIELD} />
            </PaperField>
          </div>
        </Paper>
      {/snippet}

      {#snippet rail()}
        <DetailPanel title="Serie">
          <div class="grid gap-3.5">
            <Field label="Bezeichnung" required error={errors.name}>
              <Input bind:value={name} placeholder="z. B. Monatlicher Retainer Acme" />
            </Field>
            <Field label="Intervall">
              <Select
                bind:value={() => interval, (v) => (interval = v as RecurringInterval)}
                items={RECURRING_INTERVAL_ITEMS}
              />
            </Field>
            <Field label="Erste Fälligkeit">
              <DatePicker bind:value={startDateIso} required />
            </Field>
            <CheckField bind:checked={active} label="Aktiv (erscheint in der Übersicht)" />
          </div>
        </DetailPanel>
        {#if settings && (!settings.isKleinunternehmer || isReverseCharge)}
          <DetailPanel title="Optionen">
            <div class="grid gap-3.5">
              <ReverseChargeField
                bind:type={reverseChargeType}
                bind:supplyKind
                sender={settings}
                customer={reference.selectedCustomer}
                note="Wird bei jeder erzeugten Rechnung übernommen."
                error={errors.reverseCharge}
              />
            </div>
          </DetailPanel>
        {/if}
        {#if reference.selectedCustomer}
          <CustomerPanel customer={reference.selectedCustomer} />
        {/if}
      {/snippet}
    </EditorLayout>

    <EditorSaveBar
      submitLabel="Speichern"
      {saving}
      error={shownError}
      onCancel={() => push("/recurring")}
      total={formatMoney(totals.total, "EUR")}
      totalLabel="Betrag je Rechnung"
    />
  </form>
{/if}
