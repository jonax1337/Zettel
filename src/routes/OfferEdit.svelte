<script lang="ts">
  import { link, push } from "svelte-spa-router";
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
  import { ArrowLeft, Plus, Trash2 } from "@lucide/svelte";

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
  let items = $state<Array<OfferItemInput & { priceText: string }>>([
    { description: "", quantity: 1, unit: "Stk", unitPrice: 0, vatRate: 0, priceText: "" },
  ]);
  let currency = $state<string>("EUR");
  let exchangeRate = $state<string>("");

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
          items = res.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            vatRate: it.vatRate,
            priceText: (it.unitPrice / 100).toFixed(2).replace(".", ","),
          }));
        })
        .catch((e) => (error = String(e)))
        .finally(() => (loaded = true));
    }
  });

  function addItem() {
    items = [
      ...items,
      {
        description: "",
        quantity: 1,
        unit: "Stk",
        unitPrice: 0,
        vatRate: isReverseCharge ? 0 : settings?.isKleinunternehmer ? 0 : 19,
        priceText: "",
      },
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
    saving = true;
    error = null;
    try {
      const input: OfferFormInput = {
        customerId,
        issueDate: fromIsoDate(issueDateIso),
        validUntil: fromIsoDate(validUntilIso),
        notes: notes.trim() || null,
        introText: introText.trim() || null,
        isReverseCharge,
        items: items.map(({ priceText: _p, ...rest }) => rest),
        currency,
        exchangeRate: currency === "EUR" ? null : exchangeRate.trim(),
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
            <div class="flex flex-col gap-1.5">
              <Label>Währung</Label>
              <Select bind:value={currency} items={currencyItems} disabled={readOnly} />
            </div>
            {#if isForeignCurrency}
              <div class="flex flex-col gap-1.5">
                <Label>Wechselkurs</Label>
                <Input
                  type="text"
                  bind:value={exchangeRate}
                  placeholder="z. B. 1,0832"
                  inputmode="decimal"
                  disabled={readOnly}
                />
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
                <td class="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                <td class="px-2 py-1.5">
                  <Input bind:value={it.description} required disabled={readOnly} />
                </td>
                <td class="px-2 py-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={it.quantity}
                    disabled={readOnly}
                  />
                </td>
                <td class="px-2 py-1.5">
                  <Input bind:value={it.unit} disabled={readOnly} />
                </td>
                <td class="px-2 py-1.5">
                  <Input
                    bind:value={it.priceText}
                    onblur={() => onPriceBlur(idx)}
                    placeholder="0,00"
                    class="text-right"
                    disabled={readOnly}
                  />
                </td>
                {#if !vatExempt}
                  <td class="px-2 py-1.5">
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
                <td class="px-3 py-2 text-right font-mono text-xs">
                  {formatMoney(computeLineTotal(it), currency)}
                </td>
                <td class="px-2 py-1.5 text-right">
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
