<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    computeLineTotal,
    computeTotals,
    createInvoice,
    getInvoice,
    updateInvoice,
    type InvoiceFormInput,
    type InvoiceItemInput,
  } from "$lib/db/invoices";
  import type { Customer, Settings } from "$lib/db/schema";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
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
    Select,
    toast,
  } from "$lib/ui";
  import { ArrowLeft, Plus, Trash2 } from "@lucide/svelte";
  import { isPopupWindow, emitSavedAndClose } from "$lib/window";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();
  const popup = isPopupWindow();

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
  let id = $state<number | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);

  let customerIdStr = $state<string>("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let deliveryDateIso = $state("");
  let dueDateIso = $state(toIsoDate(addDaysUnix(nowUnix(), 14)));
  let notes = $state("");
  let paymentTerms = $state("");
  let items = $state<Array<InvoiceItemInput & { priceText: string }>>([
    { description: "", quantity: 1, unit: "Stk", unitPrice: 0, vatRate: 0, priceText: "" },
  ]);

  $effect(() => {
    Promise.all([loadSettings(), listCustomers()])
      .then(([s, cs]) => {
        settings = s;
        customers = cs;
        if (mode === "new") {
          paymentTerms = `Zahlbar innerhalb von ${s.defaultPaymentTermsDays} Tagen ohne Abzug.`;
          for (const it of items) it.vatRate = s.isKleinunternehmer ? 0 : 19;
          items = [...items];
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
          issueDateIso = toIsoDate(res.invoice.issueDate);
          deliveryDateIso = res.invoice.deliveryDate
            ? toIsoDate(res.invoice.deliveryDate)
            : "";
          dueDateIso = toIsoDate(res.invoice.dueDate);
          notes = res.invoice.notes ?? "";
          paymentTerms = res.invoice.paymentTerms ?? "";
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
        vatRate: settings?.isKleinunternehmer ? 0 : 19,
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
    return computeTotals(items, settings.isKleinunternehmer);
  });

  const customerItems = $derived(
    customers.map((c) => ({ value: String(c.id), label: `${c.customerNumber} · ${c.name}` })),
  );

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
    saving = true;
    error = null;
    try {
      const input: InvoiceFormInput = {
        customerId,
        issueDate: fromIsoDate(issueDateIso),
        deliveryDate: deliveryDateIso ? fromIsoDate(deliveryDateIso) : null,
        dueDate: fromIsoDate(dueDateIso),
        notes: notes.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        items: items.map(({ priceText: _p, ...rest }) => rest),
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
      if (popup) {
        await emitSavedAndClose("invoice:saved", { id: savedId });
      } else {
        push(`/invoices/${savedId}`);
      }
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  async function onCancel() {
    if (popup) {
      await getCurrentWindow().close();
    } else {
      push("/invoices");
    }
  }

  const vatItems = [
    { value: "0", label: "0 %" },
    { value: "7", label: "7 %" },
    { value: "19", label: "19 %" },
  ];
</script>

{#if !popup}
  <header class="mb-6">
    <a
      href="/invoices"
      use:link
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft class="size-4" /> Rechnungen
    </a>
    <h1 class="text-3xl font-semibold tracking-tight mt-2">
      {mode === "new" ? "Neue Rechnung" : "Rechnung bearbeiten"}
    </h1>
  </header>
{/if}

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
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
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Rechnungsdatum</Label>
            <Input type="date" bind:value={issueDateIso} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Fällig am</Label>
            <Input type="date" bind:value={dueDateIso} required />
          </div>
          <div class="flex flex-col gap-1.5 col-span-2">
            <Label>Liefer-/Leistungsdatum</Label>
            <Input type="date" bind:value={deliveryDateIso} />
          </div>
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
              {#if !settings?.isKleinunternehmer}
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
                  <Input bind:value={it.description} required />
                </td>
                <td class="px-2 py-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={it.quantity}
                  />
                </td>
                <td class="px-2 py-1.5">
                  <Input bind:value={it.unit} />
                </td>
                <td class="px-2 py-1.5">
                  <Input
                    bind:value={it.priceText}
                    onblur={() => onPriceBlur(idx)}
                    placeholder="0,00"
                    class="text-right"
                  />
                </td>
                {#if !settings?.isKleinunternehmer}
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
                    />
                  </td>
                {/if}
                <td class="px-3 py-2 text-right font-mono text-xs">
                  {centsToEur(computeLineTotal(it))}
                </td>
                <td class="px-2 py-1.5 text-right">
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
              <td colspan={settings?.isKleinunternehmer ? 5 : 6} class="px-3 py-2 text-right text-muted-foreground">
                Zwischensumme
              </td>
              <td class="px-3 py-2 text-right font-mono">{centsToEur(totals.subtotal)}</td>
              <td></td>
            </tr>
            {#if !settings?.isKleinunternehmer}
              <tr>
                <td colspan="6" class="px-3 py-2 text-right text-muted-foreground">USt</td>
                <td class="px-3 py-2 text-right font-mono">{centsToEur(totals.vatAmount)}</td>
                <td></td>
              </tr>
            {/if}
            <tr class="border-t">
              <td colspan={settings?.isKleinunternehmer ? 5 : 6} class="px-3 py-2 text-right font-semibold">
                Gesamtbetrag
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
      <Button type="button" onclick={onCancel} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
