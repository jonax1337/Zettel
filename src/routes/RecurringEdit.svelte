<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    createRecurring,
    getRecurring,
    templatePrefillRejection,
    updateRecurring,
    type RecurringFormInput,
  } from "$lib/db/recurring";
  import {
    computeTotals,
    getInvoice,
    type ReverseChargeType,
    type SupplyKind,
  } from "$lib/db/invoices";
  import type { CatalogItem, Customer, RecurringInterval, Settings } from "$lib/db/schema";
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import {
    Button,
    Input,
    Textarea,
    Label,
    Card,
    CardContent,
    CatalogPicker,
    DatePicker,
    Select,
    Checkbox,
    toast,
  } from "$lib/ui";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { fetchEditTarget, parseId } from "./parts/entity/edit-target";
  import { centsToPriceText } from "./parts/entity/format";
  import { RECURRING_INTERVAL_ITEMS } from "./parts/entity/recurring";
  import { vatRateForNewItem } from "./parts/entity/vat";
  import {
    REVERSE_CHARGE_HINTS,
    REVERSE_CHARGE_ITEMS,
    reverseChargeBlockedReason,
  } from "./parts/entity/reverse-charge";
  import SupplyKindField from "./invoice/SupplyKindField.svelte";
  import { DEFAULT_SUPPLY_KIND } from "./invoice/supply-kind";
  import RecurringItemsTable from "./parts/recurring/RecurringItemsTable.svelte";
  import {
    emptyItemRow,
    itemInputFromRow,
    itemRowFromStored,
    paymentTermDays,
    type RecurringItemRow,
  } from "./parts/recurring/recurring-items";

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

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
  let referenceDataLoaded = $state(false);
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
  let items = $state<RecurringItemRow[]>([emptyItemRow(0)]);

  let catalogPickerOpen = $state(false);

  const selectedCustomer = $derived(
    customerIdStr ? customers.find((c) => String(c.id) === customerIdStr) ?? null : null,
  );

  const isReverseCharge = $derived(reverseChargeType !== "none");
  const blockedReason = $derived(
    reverseChargeBlockedReason(reverseChargeType, settings, selectedCustomer),
  );
  const vatExempt = $derived(!!settings?.isKleinunternehmer || isReverseCharge);
  const customerItems = $derived(
    customers.map((c) => ({ value: String(c.id), label: `${c.customerNumber} · ${c.name}` })),
  );
  const totals = $derived(
    settings
      ? computeTotals(items, { isKleinunternehmer: settings.isKleinunternehmer, isReverseCharge })
      : { subtotal: 0, vatAmount: 0, total: 0 },
  );

  // Not before the customers and settings are in: a template loaded earlier would otherwise lose its type.
  $effect(() => {
    if (referenceDataLoaded && blockedReason) reverseChargeType = "none";
  });

  $effect(() => {
    if (!isReverseCharge) return;
    for (const item of items) item.vatRate = 0;
  });

  $effect(() => {
    Promise.all([loadSettings(), listCustomers()])
      .then(async ([loadedSettings, loadedCustomers]) => {
        settings = loadedSettings;
        customers = loadedCustomers;
        referenceDataLoaded = true;
        if (mode === "new") await prepareNewTemplate(loadedSettings);
      })
      .catch((e) => (error = String(e)));
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
      error = rejection;
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
    if (source.items.length > 0) items = source.items.map(itemRowFromStored);
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
    reverseChargeType = recurring.reverseChargeType;
    supplyKind = recurring.supplyKind;
    active = recurring.active;
    notes = recurring.notes ?? "";
    paymentTerms = recurring.paymentTerms ?? "";
    items = storedItems.map(itemRowFromStored);
  }

  function addItem() {
    items = [...items, emptyItemRow(vatRateForNewItem(!!settings?.isKleinunternehmer))];
  }

  function addFromCatalog(catalogItem: CatalogItem) {
    const row = emptyItemRow(vatExempt ? 0 : catalogItem.defaultVatRate);
    row.description = catalogItem.name;
    row.unit = catalogItem.unit;
    row.unitPrice = catalogItem.defaultUnitPrice;
    row.priceText = centsToPriceText(catalogItem.defaultUnitPrice);
    if (catalogItem.descriptionDe) {
      row.longDescription = catalogItem.descriptionDe;
      row.showDetail = true;
    }
    items = [...items, row];
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
      items: items.map(itemInputFromRow),
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
            <Select bind:value={customerIdStr} items={customerItems} placeholder="— bitte wählen —" />
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
          {#if settings && !settings.isKleinunternehmer}
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>Reverse-Charge</Label>
              <Select
                bind:value={reverseChargeType}
                items={REVERSE_CHARGE_ITEMS}
                disabled={!settings.vatId}
              />
              <p class="text-xs text-muted-foreground">
                {REVERSE_CHARGE_HINTS[reverseChargeType]} Wird bei jeder erzeugten Rechnung übernommen.
              </p>
              {#if blockedReason}
                <p class="text-xs text-warning">{blockedReason}</p>
              {/if}
            </div>
            {#if reverseChargeType !== "none"}
              <SupplyKindField bind:value={supplyKind} {reverseChargeType} />
            {/if}
          {/if}
        </section>
      </CardContent>
    </Card>

    <RecurringItemsTable
      bind:items
      {vatExempt}
      totalCents={totals.total}
      onAdd={addItem}
      onAddFromCatalog={() => (catalogPickerOpen = true)}
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

  <CatalogPicker bind:open={catalogPickerOpen} onPick={addFromCatalog} />
{/if}
