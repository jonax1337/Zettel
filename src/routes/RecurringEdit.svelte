<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    createRecurring,
    getRecurring,
    updateRecurring,
    type RecurringFormInput,
    type RecurringItemInput,
  } from "$lib/db/recurring";
  import { computeLineTotal, computeTotals, getInvoice } from "$lib/db/invoices";
  import type { Customer, Settings, RecurringInterval } from "$lib/db/schema";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
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
    querystring?: string;
  };
  let { mode, params, querystring }: Props = $props();

  const fromInvoiceId = $derived.by(() => {
    if (mode !== "new" || !querystring) return null;
    const v = new URLSearchParams(querystring).get("fromInvoice");
    if (!v) return null;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  });

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
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
  let isReverseCharge = $state(false);
  let active = $state(true);
  let notes = $state("");
  let paymentTerms = $state("");
  type ItemUI = RecurringItemInput & {
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

  const selectedCustomer = $derived(
    customerIdStr ? customers.find((c) => String(c.id) === customerIdStr) ?? null : null,
  );

  const canReverseCharge = $derived(
    !!settings &&
      !settings.isKleinunternehmer &&
      !!settings.vatId &&
      !!selectedCustomer?.vatId,
  );

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
      .then(async ([s, cs]) => {
        settings = s;
        customers = cs;
        if (mode === "new") {
          paymentTermsDays = s.defaultPaymentTermsDays;
          for (const it of items) it.vatRate = s.isKleinunternehmer ? 0 : 19;
          items = [...items];
          if (fromInvoiceId !== null) {
            const res = await getInvoice(fromInvoiceId);
            if (res) {
              customerIdStr = String(res.invoice.customerId);
              isReverseCharge = res.invoice.isReverseCharge;
              paymentTerms = res.invoice.paymentTerms ?? "";
              const days = Math.max(
                0,
                Math.round((res.invoice.dueDate - res.invoice.issueDate) / 86400),
              );
              paymentTermsDays = days || s.defaultPaymentTermsDays;
              if (res.items.length > 0) {
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
              }
              startDateIso = "";
            }
          }
        }
      })
      .catch((e) => (error = String(e)));
  });

  $effect(() => {
    if (mode === "edit" && params?.id) {
      const numId = Number.parseInt(params.id, 10);
      if (Number.isNaN(numId)) return;
      id = numId;
      getRecurring(numId)
        .then((res) => {
          if (!res) {
            error = "Vorlage nicht gefunden.";
            return;
          }
          name = res.recurring.name;
          customerIdStr = String(res.recurring.customerId);
          interval = res.recurring.interval;
          startDateIso = toIsoDate(res.recurring.startDate);
          paymentTermsDays = res.recurring.paymentTermsDays;
          isReverseCharge = res.recurring.isReverseCharge;
          active = res.recurring.active;
          notes = res.recurring.notes ?? "";
          paymentTerms = res.recurring.paymentTerms ?? "";
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

  const intervalItems = [
    { value: "monthly", label: "Monatlich" },
    { value: "quarterly", label: "Quartalsweise" },
    { value: "yearly", label: "Jährlich" },
  ];

  const vatItems = [
    { value: "0", label: "0 %" },
    { value: "7", label: "7 %" },
    { value: "19", label: "19 %" },
  ];

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    const customerId = customerIdStr ? Number.parseInt(customerIdStr, 10) : null;
    if (!name.trim()) {
      error = "Bitte einen Namen vergeben.";
      return;
    }
    if (customerId === null || Number.isNaN(customerId)) {
      error = "Bitte einen Kunden auswählen.";
      return;
    }
    if (items.length === 0) {
      error = "Mindestens eine Position erforderlich.";
      return;
    }
    saving = true;
    error = null;
    try {
      const input: RecurringFormInput = {
        name: name.trim(),
        customerId,
        interval,
        startDate: fromIsoDate(startDateIso),
        paymentTermsDays,
        isReverseCharge,
        notes: notes.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        active,
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
      };
      let savedId: number;
      if (mode === "new") {
        savedId = await createRecurring(input);
        toast.success("Vorlage erstellt");
      } else if (id !== null) {
        await updateRecurring(id, input);
        toast.success("Änderungen gespeichert");
        savedId = id;
      } else {
        throw new Error("Keine ID");
      }
      push(`/recurring`);
      void savedId;
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }
</script>

<header class="mb-6">
  <a
    href="/recurring"
    use:link
    class="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" /> Wiederkehrende Rechnungen
  </a>
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
            <Select bind:value={interval as unknown as string} items={intervalItems} />
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
            <div class="col-span-2 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Checkbox
                id="rc-recurring"
                bind:checked={isReverseCharge}
                disabled={!canReverseCharge}
                class="mt-0.5"
              />
              <div class="flex-1 text-sm">
                <label for="rc-recurring" class="font-medium cursor-pointer">
                  Reverse-Charge (intra-EU B2B)
                </label>
                <p class="text-xs text-muted-foreground mt-0.5">
                  Wird bei jeder erzeugten Rechnung übernommen. Setzt 0&nbsp;% USt und den Hinweistext.
                </p>
              </div>
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
        <Button type="button" size="sm" variant="outline" onclick={addItem}>
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
              <th class="px-3 py-2 w-28 font-medium">Preis (€)</th>
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
                        placeholder="Detail-Beschreibung"
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
                  <Input type="number" step="0.01" min="0" bind:value={it.quantity} />
                </td>
                <td class="px-2 py-1.5 align-top pt-1.5"><Input bind:value={it.unit} /></td>
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
                  {centsToEur(computeLineTotal(it))}
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
              <td colspan={vatExempt ? 5 : 6} class="px-3 py-2 text-right font-semibold">
                Voraussichtlicher Gesamtbetrag pro Erzeugung
              </td>
              <td class="px-3 py-2 text-right font-mono font-semibold">{centsToEur(totals.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </section>

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
{/if}
