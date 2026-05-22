<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { invoke } from "@tauri-apps/api/core";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    computeLineTotal,
    computeTotals,
    createInvoice,
    getInvoice,
    updateInvoice,
    type InvoiceFormInput,
    type InvoiceItemInput,
    type ReverseChargeType,
  } from "$lib/db/invoices";
  import type { Customer, Settings } from "$lib/db/schema";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import {
    SUPPORTED_CURRENCIES,
    computeEurTotalCent,
    formatMoney,
    parseExchangeRateScaled,
  } from "$lib/utils/currency";
  import {
    addDaysUnix,
    fromIsoDate,
    nowUnix,
    toIsoDate,
  } from "$lib/utils/date";
  import {
    Button,
    Input,
    Textarea,
    Label,
    Card,
    CardContent,
    CatalogPicker,
    Checkbox,
    DatePicker,
    Select,
    toast,
  } from "$lib/ui";
  import { ArrowLeft, Plus, Trash2, AlertTriangle, CalendarRange, FileText, X, Package } from "@lucide/svelte";
  import type { CatalogItem } from "$lib/db/schema";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
  let id = $state<number | null>(null);
  let invoiceNumber = $state<string>("");
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);

  let customerIdStr = $state<string>("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let serviceMode = $state<"single" | "period">("single");
  let deliveryDateIso = $state("");
  let servicePeriodStartIso = $state("");
  let servicePeriodEndIso = $state("");
  let dueDateIso = $state(toIsoDate(addDaysUnix(nowUnix(), 14)));
  let notes = $state("");
  let paymentTerms = $state("");
  let reverseChargeType = $state<ReverseChargeType>("none");
  const isReverseCharge = $derived(reverseChargeType !== "none");
  let isCreditNote = $state(false);
  let correctsInvoiceId = $state<number | null>(null);

  type ItemUI = InvoiceItemInput & {
    priceText: string;
    longDescription: string;
    linePeriodMode: "single" | "range";
    linePeriodSingleIso: string;
    linePeriodStartIso: string;
    linePeriodEndIso: string;
    showDetail: boolean;
    showPeriod: boolean;
  };
  function emptyItem(vatRate = 0): ItemUI {
    return {
      description: "",
      quantity: 1,
      unit: "Stk",
      unitPrice: 0,
      vatRate,
      priceText: "",
      longDescription: "",
      linePeriodMode: "single",
      linePeriodSingleIso: "",
      linePeriodStartIso: "",
      linePeriodEndIso: "",
      showDetail: false,
      showPeriod: false,
    };
  }
  let items = $state<ItemUI[]>([emptyItem()]);
  let currency = $state<string>("EUR");
  let exchangeRate = $state<string>("");
  let fetchingRate = $state(false);

  let skontoEnabled = $state(false);
  let skontoPercent = $state<number>(2);
  let skontoDays = $state<number>(7);
  let pdfLanguage = $state<"de" | "en">("de");

  const pdfLanguageItems = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "Englisch" },
  ];

  async function fetchEcbRate() {
    if (currency === "EUR") return;
    fetchingRate = true;
    try {
      const rate = await invoke<string>("fetch_ecb_exchange_rate", { currency });
      exchangeRate = rate.replace(".", ",");
      toast.success("EZB-Tageskurs übernommen", `1 EUR = ${exchangeRate} ${currency}`);
    } catch (e) {
      toast.error("Kurs konnte nicht geholt werden", String(e));
    } finally {
      fetchingRate = false;
    }
  }

  const selectedCustomer = $derived(
    customerIdStr ? customers.find((c) => String(c.id) === customerIdStr) ?? null : null,
  );

  // Reverse-Charge: sender must not be Kleinunternehmer. intra_eu requires both
  // VAT-IDs; third_country (export outside EU) only requires the sender's. The
  // EU/non-EU country judgement stays with the user.
  const canReverseChargeIntraEu = $derived(
    !!settings &&
      !settings.isKleinunternehmer &&
      !!settings.vatId &&
      !!selectedCustomer?.vatId,
  );

  const canReverseChargeThirdCountry = $derived(
    !!settings && !settings.isKleinunternehmer && !!settings.vatId,
  );

  const reverseChargeBlockedReason = $derived.by(() => {
    if (!settings) return "";
    if (settings.isKleinunternehmer)
      return "Nicht verfügbar für Kleinunternehmer (§ 19 UStG).";
    if (!settings.vatId)
      return "Eigene USt-IdNr. in den Einstellungen fehlt.";
    if (reverseChargeType === "intra_eu") {
      if (!selectedCustomer) return "Erst Kunden auswählen.";
      if (!selectedCustomer.vatId)
        return "Innergemeinschaftliche Lieferung: Kunde benötigt USt-IdNr.";
    }
    return "";
  });

  $effect(() => {
    if (reverseChargeType === "intra_eu" && !canReverseChargeIntraEu)
      reverseChargeType = "none";
    if (reverseChargeType === "third_country" && !canReverseChargeThirdCountry)
      reverseChargeType = "none";
  });

  $effect(() => {
    if (isReverseCharge) {
      let changed = false;
      for (const it of items) {
        if (it.vatRate !== 0) {
          it.vatRate = 0;
          changed = true;
        }
      }
      if (changed) items = [...items];
    }
  });

  const vatExempt = $derived(!!settings?.isKleinunternehmer || isReverseCharge);

  $effect(() => {
    Promise.all([loadSettings(), listCustomers()])
      .then(([s, cs]) => {
        settings = s;
        customers = cs;
        if (mode === "new") {
          paymentTerms = `Zahlbar innerhalb von ${s.defaultPaymentTermsDays} Tagen ohne Abzug.`;
          for (const it of items) it.vatRate = s.isKleinunternehmer ? 0 : 19;
          items = [...items];
          if (s.defaultSkontoActive) {
            skontoEnabled = true;
            skontoPercent = s.defaultSkontoPercent;
            skontoDays = s.defaultSkontoDays;
          }
          pdfLanguage = s.defaultPdfLanguage;
        }
      })
      .catch((e) => (error = String(e)));
  });

  $effect(() => {
    if (mode === "edit" && params?.id) {
      const numId = Number.parseInt(params.id, 10);
      if (Number.isNaN(numId)) return;
      id = numId;
      getInvoice(numId)
        .then((res) => {
          if (!res) {
            error = "Rechnung nicht gefunden.";
            return;
          }
          if (res.invoice.status !== "draft") {
            error = "Nur Entwürfe können bearbeitet werden.";
            return;
          }
          customerIdStr = String(res.invoice.customerId);
          invoiceNumber = res.invoice.number;
          issueDateIso = toIsoDate(res.invoice.issueDate);
          deliveryDateIso = res.invoice.deliveryDate
            ? toIsoDate(res.invoice.deliveryDate)
            : "";
          if (res.invoice.servicePeriodStart && res.invoice.servicePeriodEnd) {
            serviceMode = "period";
            servicePeriodStartIso = toIsoDate(res.invoice.servicePeriodStart);
            servicePeriodEndIso = toIsoDate(res.invoice.servicePeriodEnd);
          } else {
            serviceMode = "single";
          }
          dueDateIso = toIsoDate(res.invoice.dueDate);
          notes = res.invoice.notes ?? "";
          paymentTerms = res.invoice.paymentTerms ?? "";
          reverseChargeType = res.invoice.reverseChargeType;
          isCreditNote = res.invoice.isCreditNote;
          correctsInvoiceId = res.invoice.correctsInvoiceId;
          currency = res.invoice.currency ?? "EUR";
          exchangeRate = res.invoice.exchangeRate ?? "";
          if (res.invoice.skontoPercent != null && res.invoice.skontoDays != null) {
            skontoEnabled = true;
            skontoPercent = res.invoice.skontoPercent;
            skontoDays = res.invoice.skontoDays;
          }
          pdfLanguage = (res.invoice.pdfLanguage ?? "de") as "de" | "en";
          items = res.items.map((it) => {
            const isSingle =
              !!it.linePeriodStart &&
              !!it.linePeriodEnd &&
              it.linePeriodStart === it.linePeriodEnd;
            return {
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              vatRate: it.vatRate,
              priceText: (it.unitPrice / 100).toFixed(2).replace(".", ","),
              longDescription: it.longDescription ?? "",
              linePeriodMode: (isSingle ? "single" : "range") as "single" | "range",
              linePeriodSingleIso: isSingle ? toIsoDate(it.linePeriodStart!) : "",
              linePeriodStartIso: it.linePeriodStart ? toIsoDate(it.linePeriodStart) : "",
              linePeriodEndIso: it.linePeriodEnd ? toIsoDate(it.linePeriodEnd) : "",
              showDetail: !!it.longDescription,
              showPeriod: !!(it.linePeriodStart && it.linePeriodEnd),
            };
          });
        })
        .catch((e) => (error = String(e)))
        .finally(() => (loaded = true));
    }
  });

  function addItem() {
    items = [...items, emptyItem(settings?.isKleinunternehmer ? 0 : 19)];
  }

  let catalogPickerOpen = $state(false);
  function addFromCatalog(it: CatalogItem) {
    const vatRate = vatExempt ? 0 : it.defaultVatRate;
    const next = emptyItem(vatRate);
    next.description = it.name;
    next.quantity = 1;
    next.unit = it.unit;
    next.unitPrice = it.defaultUnitPrice;
    next.priceText = (it.defaultUnitPrice / 100).toFixed(2).replace(".", ",");
    const desc = pdfLanguage === "en" && it.descriptionEn ? it.descriptionEn : it.descriptionDe;
    if (desc) {
      next.longDescription = desc;
      next.showDetail = true;
    }
    items = [...items, next];
  }

  function removeItem(idx: number) {
    items = items.filter((_, i) => i !== idx);
  }

  function onPriceBlur(idx: number) {
    const it = items[idx];
    it.unitPrice = eurStringToCents(it.priceText);
    it.priceText = (it.unitPrice / 100).toFixed(2).replace(".", ",");
    items = [...items];
  }

  const totals = $derived.by(() => {
    if (!settings) return { subtotal: 0, vatAmount: 0, total: 0 };
    return computeTotals(items, {
      isKleinunternehmer: settings.isKleinunternehmer,
      isReverseCharge,
    });
  });

  const customerItems = $derived(
    customers.map((c) => ({ value: String(c.id), label: `${c.customerNumber} · ${c.name}` })),
  );

  const currencyItems = SUPPORTED_CURRENCIES.map((c) => ({
    value: c.code,
    label: c.label,
  }));

  const isForeignCurrency = $derived(currency !== "EUR");
  const rateScaled = $derived(
    isForeignCurrency ? parseExchangeRateScaled(exchangeRate) : null,
  );
  const eurEquivalentCent = $derived(
    isForeignCurrency
      ? computeEurTotalCent(currency, totals.total, exchangeRate)
      : totals.total,
  );

  const rcItems: { value: ReverseChargeType; label: string }[] = [
    { value: "none", label: "Keine" },
    { value: "intra_eu", label: "Innergemeinschaftliche Lieferung (EU)" },
    { value: "third_country", label: "Ausfuhrlieferung Drittland" },
  ];

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const customerId = customerIdStr ? Number.parseInt(customerIdStr, 10) : null;
    if (customerId === null || Number.isNaN(customerId)) {
      error = "Bitte einen Kunden auswählen.";
      return;
    }
    if (items.length === 0) {
      error = "Mindestens eine Position erforderlich.";
      return;
    }
    if (reverseChargeType !== "none") {
      if (settings?.isKleinunternehmer) {
        error = "Reverse-Charge ist für Kleinunternehmer nicht zulässig.";
        return;
      }
      if (reverseChargeType === "intra_eu" && !selectedCustomer?.vatId) {
        error = "Innergemeinschaftliche Lieferung erfordert eine USt-IdNr. des Kunden.";
        return;
      }
      if (items.some((it) => it.vatRate !== 0)) {
        error = "Bei Reverse-Charge müssen alle Positionen 0 % USt haben.";
        return;
      }
    }
    if (currency !== "EUR") {
      if (!exchangeRate || !parseExchangeRateScaled(exchangeRate)) {
        error = `Wechselkurs erforderlich für ${currency}. Format: 1 EUR = X ${currency}.`;
        return;
      }
    }
    if (serviceMode === "period") {
      if (!servicePeriodStartIso || !servicePeriodEndIso) {
        error = "Leistungszeitraum: Start- und Enddatum erforderlich.";
        return;
      }
      if (fromIsoDate(servicePeriodEndIso) < fromIsoDate(servicePeriodStartIso)) {
        error = "Leistungszeitraum: Enddatum vor Startdatum.";
        return;
      }
    }
    for (const it of items) {
      if (it.showPeriod && it.linePeriodMode === "range") {
        if (it.linePeriodStartIso && it.linePeriodEndIso) {
          if (fromIsoDate(it.linePeriodEndIso) < fromIsoDate(it.linePeriodStartIso)) {
            error = `Positions-Zeitraum: Enddatum vor Startdatum (${it.description || "ohne Beschreibung"}).`;
            return;
          }
        }
      }
    }
    saving = true;
    error = null;
    try {
      const eurTotalCent =
        currency === "EUR"
          ? totals.total
          : computeEurTotalCent(currency, totals.total, exchangeRate);
      const usePeriod = serviceMode === "period";
      const input: InvoiceFormInput = {
        customerId,
        issueDate: fromIsoDate(issueDateIso),
        deliveryDate: usePeriod
          ? null
          : deliveryDateIso
            ? fromIsoDate(deliveryDateIso)
            : null,
        dueDate: fromIsoDate(dueDateIso),
        notes: notes.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        reverseChargeType,
        items: items.map((it) => {
          let lpStart: number | null = null;
          let lpEnd: number | null = null;
          if (it.showPeriod) {
            if (it.linePeriodMode === "single" && it.linePeriodSingleIso) {
              const d = fromIsoDate(it.linePeriodSingleIso);
              lpStart = d;
              lpEnd = d;
            } else if (it.linePeriodMode === "range" && it.linePeriodStartIso && it.linePeriodEndIso) {
              lpStart = fromIsoDate(it.linePeriodStartIso);
              lpEnd = fromIsoDate(it.linePeriodEndIso);
            }
          }
          return {
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            vatRate: it.vatRate,
            longDescription:
              it.showDetail && it.longDescription.trim() ? it.longDescription.trim() : null,
            linePeriodStart: lpStart,
            linePeriodEnd: lpEnd,
          };
        }),
        currency,
        exchangeRate: currency === "EUR" ? null : exchangeRate.trim(),
        eurTotalCent,
        servicePeriodStart: usePeriod ? fromIsoDate(servicePeriodStartIso) : null,
        servicePeriodEnd: usePeriod ? fromIsoDate(servicePeriodEndIso) : null,
        skontoPercent: skontoEnabled && !isCreditNote ? skontoPercent : null,
        skontoDays: skontoEnabled && !isCreditNote ? skontoDays : null,
        pdfLanguage,
      };
      let savedId: number;
      if (mode === "new") {
        savedId = await createInvoice(input);
        toast.success("Rechnung erstellt");
      } else if (id !== null) {
        await updateInvoice(id, input);
        toast.success("Änderungen gespeichert");
        savedId = id;
      } else {
        throw new Error("Keine ID");
      }
      push(`/invoices/${savedId}`);
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  function onCancel() {
    push("/invoices");
  }

  const vatItems = [
    { value: "0", label: "0 %" },
    { value: "7", label: "7 %" },
    { value: "19", label: "19 %" },
  ];
</script>

<header class="mb-6">
  <a
    href="/invoices"
    use:link
    class="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" /> Rechnungen
  </a>
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
{:else}
  {#if isCreditNote}
    <Card class="border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5 mb-4">
      <CardContent>
        <div class="flex items-start gap-3">
          <AlertTriangle class="size-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div class="flex-1 text-sm">
            <div class="font-medium text-amber-700 dark:text-amber-400">Stornorechnung</div>
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
          <div class="flex flex-col gap-1.5">
            <Label>Währung</Label>
            <Select bind:value={currency} items={currencyItems} />
          </div>
          {#if isForeignCurrency}
            <div class="flex flex-col gap-1.5">
              <Label>Wechselkurs</Label>
              <div class="flex gap-2">
                <Input
                  type="text"
                  bind:value={exchangeRate}
                  placeholder="z. B. 1,0832"
                  inputmode="decimal"
                  class="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={fetchingRate}
                  onclick={fetchEcbRate}
                >
                  {fetchingRate ? "Lädt…" : "EZB-Kurs"}
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                1 EUR = X {currency}. Acht Nachkommastellen werden berücksichtigt.
              </p>
              {#if exchangeRate && !rateScaled}
                <p class="text-xs text-destructive">Ungültiger Wechselkurs.</p>
              {:else if rateScaled && eurEquivalentCent !== null}
                <p class="text-xs text-muted-foreground">
                  Gesamtbetrag in EUR: <span class="font-mono">{centsToEur(eurEquivalentCent)}</span>
                </p>
              {/if}
            </div>
          {/if}
          {#if settings && !settings.isKleinunternehmer && !isCreditNote}
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>Reverse-Charge</Label>
              <Select
                bind:value={reverseChargeType}
                items={rcItems}
                disabled={!canReverseChargeThirdCountry}
              />
              <p class="text-xs text-muted-foreground">
                {#if reverseChargeType === "intra_eu"}
                  Steuerschuldnerschaft des Leistungsempfängers (EU-B2B). Alle Positionen auf 0&nbsp;% USt.
                {:else if reverseChargeType === "third_country"}
                  Steuerfreie Ausfuhrlieferung (Drittland). Alle Positionen auf 0&nbsp;% USt.
                {:else}
                  Inlandsumsatz oder regulärer Umsatzsteuerausweis.
                {/if}
              </p>
              {#if reverseChargeBlockedReason}
                <p class="text-xs text-amber-600 dark:text-amber-500">
                  {reverseChargeBlockedReason}
                </p>
              {/if}
            </div>
          {/if}
        </section>
      </CardContent>
    </Card>

    <section>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
          Positionen
        </h2>
        <div class="inline-flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onclick={() => (catalogPickerOpen = true)}>
            <Package />
            Aus Katalog…
          </Button>
          <Button type="button" size="sm" variant="outline" onclick={addItem}>
            <Plus />
            Position
          </Button>
        </div>
      </div>
      <Card class="overflow-hidden py-0">
        <table class="w-full text-sm">
          <thead class="bg-muted/40 text-left">
            <tr class="text-xs uppercase tracking-wider text-muted-foreground">
              <th class="px-3 py-2 w-10 font-medium">#</th>
              <th class="px-3 py-2 font-medium">Beschreibung</th>
              <th class="px-3 py-2 w-20 font-medium">Menge</th>
              <th class="px-3 py-2 w-20 font-medium">Einheit</th>
              <th class="px-3 py-2 w-28 font-medium">Preis ({currency})</th>
              {#if !vatExempt}
                <th class="px-3 py-2 w-24 font-medium">USt</th>
              {/if}
              <th class="px-3 py-2 w-28 font-medium text-right">Summe</th>
              <th class="px-3 py-2 w-10 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {#each items as it, idx (idx)}
              <tr class="border-t">
                <td class="px-3 py-2 text-xs text-muted-foreground align-top pt-3">{idx + 1}</td>
                <td class="px-2 py-1.5">
                  <Input bind:value={it.description} required />
                  {#if it.showDetail}
                    <div class="mt-1.5 flex flex-col gap-1">
                      <Textarea
                        rows={2}
                        placeholder="Detail-Beschreibung (BT-154) — z. B. Sub-Leistungen, Spezifikation"
                        bind:value={it.longDescription}
                      />
                      <button
                        type="button"
                        class="self-start text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                        onclick={() => {
                          it.showDetail = false;
                          it.longDescription = "";
                          items = [...items];
                        }}
                      >
                        <X class="size-3" /> Detail entfernen
                      </button>
                    </div>
                  {/if}
                  {#if it.showPeriod}
                    <div class="mt-1.5 flex flex-col gap-1">
                      {#if it.linePeriodMode === "single"}
                        <DatePicker bind:value={it.linePeriodSingleIso} />
                      {:else}
                        <div class="grid grid-cols-2 gap-1.5">
                          <DatePicker bind:value={it.linePeriodStartIso} />
                          <DatePicker bind:value={it.linePeriodEndIso} />
                        </div>
                      {/if}
                      <div class="flex gap-3">
                        <button
                          type="button"
                          class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          onclick={() => {
                            it.linePeriodMode = it.linePeriodMode === "single" ? "range" : "single";
                            items = [...items];
                          }}
                        >
                          <CalendarRange class="size-3" />
                          {it.linePeriodMode === "single" ? "Auf Zeitraum wechseln" : "Auf Einzeltag wechseln"}
                        </button>
                        <button
                          type="button"
                          class="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                          onclick={() => {
                            it.showPeriod = false;
                            it.linePeriodSingleIso = "";
                            it.linePeriodStartIso = "";
                            it.linePeriodEndIso = "";
                            items = [...items];
                          }}
                        >
                          <X class="size-3" /> Entfernen
                        </button>
                      </div>
                    </div>
                  {/if}
                  {#if !it.showDetail || !it.showPeriod}
                    <div class="mt-1 flex gap-3">
                      {#if !it.showDetail}
                        <button
                          type="button"
                          class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          onclick={() => {
                            it.showDetail = true;
                            items = [...items];
                          }}
                        >
                          <FileText class="size-3" /> Detail-Beschreibung
                        </button>
                      {/if}
                      {#if !it.showPeriod}
                        <button
                          type="button"
                          class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                          onclick={() => {
                            it.showPeriod = true;
                            items = [...items];
                          }}
                        >
                          <CalendarRange class="size-3" /> Leistungsdatum / -zeitraum
                        </button>
                      {/if}
                    </div>
                  {/if}
                </td>
                <td class="px-2 py-1.5 align-top pt-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={it.quantity}
                  />
                </td>
                <td class="px-2 py-1.5 align-top pt-1.5">
                  <Input bind:value={it.unit} />
                </td>
                <td class="px-2 py-1.5 align-top pt-1.5">
                  <Input
                    bind:value={it.priceText}
                    onblur={() => onPriceBlur(idx)}
                    placeholder="0,00"
                    class="text-right"
                  />
                </td>
                {#if !vatExempt}
                  <td class="px-2 py-1.5 align-top pt-1.5">
                    <Select
                      bind:value={
                        () => String(it.vatRate),
                        (v) => {
                          it.vatRate = Number.parseInt(v, 10);
                          items = [...items];
                        }
                      }
                      items={vatItems}
                    />
                  </td>
                {/if}
                <td class="px-3 py-2 text-right font-mono text-xs align-top pt-3">
                  {formatMoney(computeLineTotal(it), currency)}
                </td>
                <td class="px-2 py-1.5 text-right align-top pt-1.5">
                  <button
                    type="button"
                    onclick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    class="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    title="Position entfernen"
                  >
                    <Trash2 class="size-4" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot class="bg-muted/40 text-sm">
            <tr class="border-t">
              <td colspan={vatExempt ? 5 : 6} class="px-3 py-2 text-right text-muted-foreground">
                Zwischensumme
              </td>
              <td class="px-3 py-2 text-right font-mono">{formatMoney(totals.subtotal, currency)}</td>
              <td></td>
            </tr>
            {#if !vatExempt}
              <tr>
                <td colspan="6" class="px-3 py-2 text-right text-muted-foreground">USt</td>
                <td class="px-3 py-2 text-right font-mono">{formatMoney(totals.vatAmount, currency)}</td>
                <td></td>
              </tr>
            {/if}
            <tr class="border-t">
              <td colspan={vatExempt ? 5 : 6} class="px-3 py-2 text-right font-semibold">
                Gesamtbetrag
              </td>
              <td class="px-3 py-2 text-right font-mono font-semibold">{formatMoney(totals.total, currency)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </section>

    <Card>
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-1.5 max-w-xs">
          <Label>Sprache der PDF</Label>
          <Select
            items={pdfLanguageItems}
            value={pdfLanguage}
            onValueChange={(v) => (pdfLanguage = v as "de" | "en")}
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

          <div class="border-t pt-4">
            <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox bind:checked={skontoEnabled} />
              <span class="font-medium">Skonto bei Frühzahlung anbieten</span>
            </label>
            {#if skontoEnabled}
              <div class="mt-3 ml-7 grid grid-cols-2 gap-3 max-w-md">
                <div class="flex flex-col gap-1.5">
                  <Label class="text-xs">Prozent</Label>
                  <Input
                    type="number"
                    min="0.1"
                    max="20"
                    step="0.1"
                    bind:value={skontoPercent}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label class="text-xs">Innerhalb (Tage)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    bind:value={skontoDays}
                  />
                </div>
                <p class="col-span-2 text-xs text-muted-foreground">
                  Wird strukturiert im ZUGFeRD-XML (BT-20) und als Textzeile auf der PDF ausgewiesen.
                </p>
              </div>
            {/if}
          </div>
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
      <Button type="button" onclick={onCancel} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}

<CatalogPicker bind:open={catalogPickerOpen} onPick={addFromCatalog} context="invoice" language={pdfLanguage} />
