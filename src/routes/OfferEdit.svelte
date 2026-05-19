<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { invoke } from "@tauri-apps/api/core";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    computeLineTotal,
    computeTotals,
    createOffer,
    getOffer,
    updateOffer,
    type OfferFormInput,
    type OfferItemInput,
  } from "$lib/db/offers";
  import type { Customer, Settings } from "$lib/db/schema";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import {
    SUPPORTED_CURRENCIES,
    formatMoney,
    parseExchangeRateScaled,
    computeEurTotalCent,
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
    DatePicker,
    Select,
    Checkbox,
    toast,
  } from "$lib/ui";
  import { ArrowLeft, Plus, Trash2, CalendarRange, FileText, X } from "@lucide/svelte";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);
  let readOnly = $state(false);

  let customerIdStr = $state<string>("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let validUntilIso = $state("");
  let notes = $state("");
  let introText = $state("");
  let isReverseCharge = $state(false);
  let serviceMode = $state<"none" | "period">("none");
  let servicePeriodStartIso = $state("");
  let servicePeriodEndIso = $state("");

  type ItemUI = OfferItemInput & {
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

  const canReverseCharge = $derived(
    !!settings &&
      !settings.isKleinunternehmer &&
      !!settings.vatId &&
      !!selectedCustomer?.vatId,
  );

  const reverseChargeBlockedReason = $derived.by(() => {
    if (!settings) return "";
    if (settings.isKleinunternehmer)
      return "Nicht verfügbar für Kleinunternehmer (§ 19 UStG).";
    if (!settings.vatId)
      return "Eigene USt-IdNr. in den Einstellungen fehlt.";
    if (!selectedCustomer) return "Erst Kunden auswählen.";
    if (!selectedCustomer.vatId)
      return "Kunde hat keine USt-IdNr. hinterlegt.";
    return "";
  });

  $effect(() => {
    if (!canReverseCharge && isReverseCharge) isReverseCharge = false;
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
          validUntilIso = toIsoDate(addDaysUnix(nowUnix(), s.defaultOfferValidityDays));
          for (const it of items) it.vatRate = s.isKleinunternehmer ? 0 : 19;
          items = [...items];
        }
      })
      .catch((e) => (error = String(e)));
  });

  // Keep validUntil in sync with issueDate while creating (offset = defaultValidityDays).
  $effect(() => {
    if (mode !== "new" || !settings) return;
    try {
      const issue = fromIsoDate(issueDateIso);
      validUntilIso = toIsoDate(addDaysUnix(issue, settings.defaultOfferValidityDays));
    } catch {
      // ignore
    }
  });

  $effect(() => {
    if (mode === "edit" && params?.id) {
      const numId = Number.parseInt(params.id, 10);
      if (Number.isNaN(numId)) return;
      id = numId;
      getOffer(numId)
        .then((res) => {
          if (!res) {
            error = "Angebot nicht gefunden.";
            return;
          }
          if (res.offer.status !== "draft") {
            readOnly = true;
            error = "Nur Entwürfe können bearbeitet werden.";
          }
          customerIdStr = String(res.offer.customerId);
          issueDateIso = toIsoDate(res.offer.issueDate);
          validUntilIso = toIsoDate(res.offer.validUntil);
          notes = res.offer.notes ?? "";
          introText = res.offer.introText ?? "";
          isReverseCharge = res.offer.isReverseCharge;
          currency = res.offer.currency ?? "EUR";
          exchangeRate = res.offer.exchangeRate ?? "";
          if (res.offer.servicePeriodStart && res.offer.servicePeriodEnd) {
            serviceMode = "period";
            servicePeriodStartIso = toIsoDate(res.offer.servicePeriodStart);
            servicePeriodEndIso = toIsoDate(res.offer.servicePeriodEnd);
          }
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
    items = [
      ...items,
      emptyItem(isReverseCharge ? 0 : settings?.isKleinunternehmer ? 0 : 19),
    ];
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

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (readOnly) return;
    const customerId = customerIdStr ? Number.parseInt(customerIdStr, 10) : null;
    if (customerId === null || Number.isNaN(customerId)) {
      error = "Bitte einen Kunden auswählen.";
      return;
    }
    const validItems = items.filter(
      (it) => it.description.trim() !== "" && it.unitPrice > 0,
    );
    if (validItems.length === 0) {
      error = "Mindestens eine Position mit Beschreibung und Preis erforderlich.";
      return;
    }
    if (isReverseCharge) {
      if (!settings?.vatId) {
        error = "Reverse-Charge: eigene USt-IdNr. fehlt.";
        return;
      }
      if (!selectedCustomer?.vatId) {
        error = "Reverse-Charge: Kunde hat keine USt-IdNr. hinterlegt.";
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
      const usePeriod = serviceMode === "period";
      const input: OfferFormInput = {
        customerId,
        issueDate: fromIsoDate(issueDateIso),
        validUntil: fromIsoDate(validUntilIso),
        notes: notes.trim() || null,
        introText: introText.trim() || null,
        isReverseCharge,
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
        servicePeriodStart: usePeriod ? fromIsoDate(servicePeriodStartIso) : null,
        servicePeriodEnd: usePeriod ? fromIsoDate(servicePeriodEndIso) : null,
      };
      let savedId: number;
      if (mode === "new") {
        savedId = await createOffer(input);
        toast.success("Angebot erstellt");
      } else if (id !== null) {
        await updateOffer(id, input);
        toast.success("Änderungen gespeichert");
        savedId = id;
      } else {
        throw new Error("Keine ID");
      }
      push(`/offers/${savedId}`);
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  function onCancel() {
    if (mode === "edit" && id !== null) {
      push(`/offers/${id}`);
    } else {
      push("/offers");
    }
  }

  const vatItems = [
    { value: "0", label: "0 %" },
    { value: "7", label: "7 %" },
    { value: "19", label: "19 %" },
  ];
</script>

<header class="mb-6">
  <a
    href="/offers"
    use:link
    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4" /> Angebote
  </a>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">
    {mode === "new" ? "Neues Angebot" : "Angebot bearbeiten"}
  </h1>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  {#if readOnly}
    <Card class="border-warning/40 bg-warning/5 mb-4">
      <CardContent>
        <p class="text-sm">
          Dieses Angebot ist kein Entwurf mehr und kann nicht bearbeitet werden.
        </p>
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
                <p class="text-xs text-muted-foreground">
                  EN-16931 BG-14 — mehrwöchige Leistungen.
                </p>
              {/if}
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Währung</Label>
              <Select bind:value={currency} items={currencyItems} disabled={readOnly} />
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
                    disabled={readOnly}
                    class="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={readOnly || fetchingRate}
                    onclick={fetchEcbRate}
                  >
                    {fetchingRate ? "Lädt…" : "EZB-Kurs"}
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">
                  1 EUR = X {currency}.
                </p>
                {#if exchangeRate && !rateScaled}
                  <p class="text-xs text-destructive">Ungültiger Wechselkurs.</p>
                {:else if rateScaled && eurEquivalentCent !== null}
                  <p class="text-xs text-muted-foreground">
                    Gesamt in EUR: <span class="font-mono">{centsToEur(eurEquivalentCent)}</span>
                  </p>
                {/if}
              </div>
            {/if}
            {#if settings && !settings.isKleinunternehmer}
              <div class="col-span-2 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
                <Checkbox
                  id="reverse-charge"
                  bind:checked={isReverseCharge}
                  disabled={!canReverseCharge || readOnly}
                  class="mt-0.5"
                />
                <div class="flex-1 text-sm">
                  <label for="reverse-charge" class="font-medium cursor-pointer">
                    Reverse-Charge (intra-EU B2B)
                  </label>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    Steuerschuldnerschaft des Leistungsempfängers. Setzt alle Positionen
                    auf 0&nbsp;% USt und schreibt den Hinweis auf das Angebot. Verantwortung
                    für das EU-B2B-Kriterium liegt beim Nutzer.
                  </p>
                  {#if !canReverseCharge && reverseChargeBlockedReason}
                    <p class="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      {reverseChargeBlockedReason}
                    </p>
                  {/if}
                </div>
              </div>
            {/if}
            <div class="col-span-2 flex flex-col gap-1.5">
              <Label>Einleitungstext (optional)</Label>
              <Textarea rows={3} bind:value={introText} disabled={readOnly} placeholder="Erscheint oberhalb der Positionen auf dem PDF." />
            </div>
          </section>
        </fieldset>
      </CardContent>
    </Card>

    <section>
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
          Positionen
        </h2>
        <Button type="button" size="sm" variant="outline" onclick={addItem} disabled={readOnly}>
          <Plus />
          Position
        </Button>
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
                  <Input bind:value={it.description} required disabled={readOnly} />
                  {#if it.showDetail}
                    <div class="mt-1.5 flex flex-col gap-1">
                      <Textarea
                        rows={2}
                        placeholder="Detail-Beschreibung — z. B. Sub-Leistungen, Spezifikation"
                        bind:value={it.longDescription}
                        disabled={readOnly}
                      />
                      <button
                        type="button"
                        class="self-start text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                        onclick={() => {
                          it.showDetail = false;
                          it.longDescription = "";
                          items = [...items];
                        }}
                        disabled={readOnly}
                      >
                        <X class="size-3" /> Detail entfernen
                      </button>
                    </div>
                  {/if}
                  {#if it.showPeriod}
                    <div class="mt-1.5 flex flex-col gap-1">
                      {#if it.linePeriodMode === "single"}
                        <DatePicker bind:value={it.linePeriodSingleIso} disabled={readOnly} />
                      {:else}
                        <div class="grid grid-cols-2 gap-1.5">
                          <DatePicker bind:value={it.linePeriodStartIso} disabled={readOnly} />
                          <DatePicker bind:value={it.linePeriodEndIso} disabled={readOnly} />
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
                          disabled={readOnly}
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
                          disabled={readOnly}
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
                          disabled={readOnly}
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
                          disabled={readOnly}
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
                    disabled={readOnly}
                  />
                </td>
                <td class="px-2 py-1.5 align-top pt-1.5">
                  <Input bind:value={it.unit} disabled={readOnly} />
                </td>
                <td class="px-2 py-1.5 align-top pt-1.5">
                  <Input
                    bind:value={it.priceText}
                    onblur={() => onPriceBlur(idx)}
                    placeholder="0,00"
                    class="text-right"
                    disabled={readOnly}
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
                      disabled={readOnly}
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
                    disabled={items.length === 1 || readOnly}
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
        <div class="flex flex-col gap-1.5">
          <Label>Notizen (intern)</Label>
          <Textarea rows={3} bind:value={notes} disabled={readOnly} />
        </div>
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
