<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { listVendors } from "$lib/db/queries";
  import {
    cancelExpense,
    computeLineTotal,
    computeTotals,
    createExpense,
    deleteExpense,
    getExpense,
    listCategories,
    markExpensePaid,
    updateExpense,
    type ExpenseFormInput,
    type ExpenseItemInput,
  } from "$lib/db/expenses";
  import type { Expense, ExpenseStatus, Vendor } from "$lib/db/schema";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import {
    Button,
    Input,
    Textarea,
    Label,
    Card,
    CardContent,
    Select,
    Badge,
    ConfirmDialog,
    toast,
  } from "$lib/ui";
  import { ArrowLeft, Plus, Trash2, Check, X } from "@lucide/svelte";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  let vendors = $state<Vendor[]>([]);
  let categories = $state<string[]>([]);
  let id = $state<number | null>(null);
  let existing = $state<Expense | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);

  let vendorIdStr = $state<string>("");
  let vendorNumber = $state<string>("");
  let issueDateIso = $state(toIsoDate(nowUnix()));
  let dueDateIso = $state("");
  let notes = $state("");
  let reverseCharge = $state(false);
  let items = $state<Array<ExpenseItemInput & { priceText: string }>>([
    {
      description: "",
      category: null,
      datevAccount: null,
      quantity: 1,
      unit: "Stk",
      unitPrice: 0,
      vatRate: 19,
      priceText: "",
    },
  ]);

  let confirmDeleteOpen = $state(false);
  let confirmCancelOpen = $state(false);

  $effect(() => {
    Promise.all([listVendors(), listCategories()])
      .then(([vs, cs]) => {
        vendors = vs;
        categories = cs;
      })
      .catch((e) => (error = String(e)));
  });

  // Prefill default category from selected vendor when creating a new expense.
  const selectedVendor = $derived(
    vendorIdStr ? vendors.find((v) => String(v.id) === vendorIdStr) ?? null : null,
  );
  $effect(() => {
    if (mode === "new" && selectedVendor?.defaultCategory) {
      let changed = false;
      for (const it of items) {
        if (!it.category) {
          it.category = selectedVendor.defaultCategory;
          changed = true;
        }
      }
      if (changed) items = [...items];
    }
  });

  $effect(() => {
    if (mode === "edit" && params?.id) {
      const numId = Number.parseInt(params.id, 10);
      if (Number.isNaN(numId)) return;
      id = numId;
      getExpense(numId)
        .then((res) => {
          if (!res) {
            error = "Eingangsrechnung nicht gefunden.";
            return;
          }
          existing = res.expense;
          vendorIdStr = String(res.expense.vendorId);
          vendorNumber = res.expense.number ?? "";
          issueDateIso = toIsoDate(res.expense.issueDate);
          dueDateIso = res.expense.dueDate ? toIsoDate(res.expense.dueDate) : "";
          notes = res.expense.notes ?? "";
          reverseCharge = res.expense.isReverseCharge;
          items = res.items.map((it) => ({
            description: it.description,
            category: it.category,
            datevAccount: it.datevAccount,
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
        category: selectedVendor?.defaultCategory ?? null,
        datevAccount: null,
        quantity: 1,
        unit: "Stk",
        unitPrice: 0,
        vatRate: reverseCharge ? 0 : 19,
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

  $effect(() => {
    if (reverseCharge) {
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

  const totals = $derived(computeTotals(items, { isReverseCharge: reverseCharge }));

  const editable = $derived(
    mode === "new" || (existing && existing.status !== "paid" && existing.status !== "cancelled"),
  );

  const vendorItems = $derived(
    vendors.map((v) => ({ value: String(v.id), label: `${v.vendorNumber} — ${v.name}` })),
  );

  const vatItems = [
    { value: "0", label: "0 %" },
    { value: "7", label: "7 %" },
    { value: "19", label: "19 %" },
  ];

  const statusLabel: Record<ExpenseStatus, string> = {
    draft: "Entwurf",
    open: "Offen",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };
  const statusVariant: Record<ExpenseStatus, "secondary" | "warning" | "success" | "outline"> = {
    draft: "secondary",
    open: "warning",
    paid: "success",
    cancelled: "outline",
  };

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!editable) return;
    saving = true;
    error = null;
    try {
      const vid = Number.parseInt(vendorIdStr, 10);
      if (Number.isNaN(vid)) throw new Error("Bitte Lieferant auswählen.");
      const input: ExpenseFormInput = {
        number: vendorNumber.trim() || null,
        vendorId: vid,
        issueDate: fromIsoDate(issueDateIso),
        dueDate: dueDateIso ? fromIsoDate(dueDateIso) : null,
        notes: notes.trim() || null,
        reverseChargeType: reverseCharge ? "intra_eu" : "none",
        pdfPath: existing?.pdfPath ?? null,
        items: items.map((it) => ({
          description: it.description,
          category: it.category?.trim() || null,
          datevAccount: it.datevAccount?.trim() || null,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          vatRate: it.vatRate,
        })),
      };
      if (mode === "new") {
        await createExpense(input);
        toast.success("Eingangsrechnung erfasst");
      } else if (id !== null) {
        await updateExpense(id, input);
        toast.success("Änderungen gespeichert");
      }
      push("/expenses");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  async function onMarkPaid() {
    if (id === null) return;
    try {
      await markExpensePaid(id);
      toast.success("Als bezahlt markiert");
      push("/expenses");
    } catch (e) {
      toast.error("Fehler", String(e));
    }
  }

  async function onCancel() {
    if (id === null) return;
    try {
      await cancelExpense(id);
      toast.success("Storniert");
      push("/expenses");
    } catch (e) {
      toast.error("Fehler", String(e));
    }
  }

  async function onDelete() {
    if (id === null) return;
    try {
      await deleteExpense(id);
      toast.success("Gelöscht");
      push("/expenses");
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }
</script>

<header class="mb-6 flex items-start justify-between gap-4">
  <div>
    <a
      href="/expenses"
      use:link
      class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft class="size-4" /> Eingangsrechnungen
    </a>
    <h1 class="text-3xl font-semibold tracking-tight mt-2">
      {mode === "new" ? "Neue Eingangsrechnung" : existing ? existing.internalNumber : "—"}
    </h1>
    {#if existing}
      <div class="mt-2 flex items-center gap-2">
        <Badge variant={statusVariant[existing.status]}>{statusLabel[existing.status]}</Badge>
        {#if existing.zugferdExtracted}
          <Badge variant="secondary">ZUGFeRD-Import</Badge>
        {/if}
      </div>
    {/if}
  </div>
  {#if mode === "edit" && existing && existing.status === "open"}
    <div class="flex items-center gap-2">
      <Button type="button" variant="outline" onclick={onMarkPaid}>
        <Check />
        Bezahlt
      </Button>
      <Button type="button" variant="ghost" onclick={() => (confirmCancelOpen = true)}>
        <X />
        Stornieren
      </Button>
    </div>
  {/if}
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form onsubmit={onSubmit}>
    <Card>
      <CardContent class="space-y-6">
        <section class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Lieferant <span class="text-destructive">*</span></Label>
            <Select
              bind:value={vendorIdStr}
              items={vendorItems}
              placeholder="Lieferant wählen…"
            />
            {#if vendors.length === 0}
              <p class="text-xs text-muted-foreground">
                Noch keine Lieferanten —
                <a href="/vendors/new" use:link class="underline">jetzt anlegen</a>.
              </p>
            {/if}
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Beleg-Nr. des Lieferanten</Label>
            <Input bind:value={vendorNumber} placeholder="z. B. 2026-04-123" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Rechnungsdatum <span class="text-destructive">*</span></Label>
            <Input type="date" bind:value={issueDateIso} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Fällig am</Label>
            <Input type="date" bind:value={dueDateIso} />
          </div>
          <div class="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="rc"
              bind:checked={reverseCharge}
              class="size-4 rounded border-input accent-primary"
            />
            <label for="rc" class="text-sm cursor-pointer select-none">
              Reverse-Charge (Steuerschuldnerschaft des Leistungsempfängers)
            </label>
          </div>
        </section>
      </CardContent>
    </Card>

    <section class="mt-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-medium">Positionen</h2>
        <Button type="button" variant="outline" onclick={addItem} disabled={!editable}>
          <Plus />
          Position
        </Button>
      </div>
      <Card class="overflow-hidden py-0">
        <table class="w-full text-sm">
          <thead class="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th class="px-3 py-2 w-8 font-medium">#</th>
              <th class="px-3 py-2 font-medium">Beschreibung</th>
              <th class="px-3 py-2 w-40 font-medium">Kategorie</th>
              <th class="px-3 py-2 w-20 font-medium">Menge</th>
              <th class="px-3 py-2 w-24 font-medium">Einzelpreis</th>
              {#if !reverseCharge}
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
                  <Input bind:value={it.description} required disabled={!editable} />
                </td>
                <td class="px-2 py-1.5">
                  <Input
                    bind:value={it.category}
                    list="expense-categories"
                    placeholder="z. B. Software"
                    disabled={!editable}
                  />
                </td>
                <td class="px-2 py-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    bind:value={it.quantity}
                    disabled={!editable}
                  />
                </td>
                <td class="px-2 py-1.5">
                  <Input
                    bind:value={it.priceText}
                    onblur={() => onPriceBlur(idx)}
                    placeholder="0,00"
                    class="text-right"
                    disabled={!editable}
                  />
                </td>
                {#if !reverseCharge}
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
                    disabled={items.length === 1 || !editable}
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
              <td colspan={reverseCharge ? 6 : 7} class="px-3 py-2 text-right text-muted-foreground">
                Zwischensumme
              </td>
              <td class="px-3 py-2 text-right font-mono">{centsToEur(totals.subtotal)}</td>
              <td></td>
            </tr>
            {#if !reverseCharge}
              <tr>
                <td colspan="7" class="px-3 py-2 text-right text-muted-foreground">USt (Vorsteuer)</td>
                <td class="px-3 py-2 text-right font-mono">{centsToEur(totals.vatAmount)}</td>
                <td></td>
              </tr>
            {/if}
            <tr class="border-t">
              <td colspan={reverseCharge ? 6 : 7} class="px-3 py-2 text-right font-semibold">
                Gesamtbetrag
              </td>
              <td class="px-3 py-2 text-right font-mono font-semibold">{centsToEur(totals.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <datalist id="expense-categories">
        {#each categories as c (c)}
          <option value={c}></option>
        {/each}
      </datalist>
    </section>

    <Card class="mt-6">
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-1.5">
          <Label>Notizen</Label>
          <Textarea rows={3} bind:value={notes} disabled={!editable} />
        </div>
      </CardContent>
    </Card>

    <div class="flex items-center gap-3 mt-6">
      {#if editable}
        <Button type="submit" disabled={saving}>
          {saving ? "Speichere…" : mode === "new" ? "Erfassen" : "Speichern"}
        </Button>
      {/if}
      <Button type="button" onclick={() => push("/expenses")} variant="ghost">
        {editable ? "Abbrechen" : "Zurück"}
      </Button>
      {#if mode === "edit" && existing && existing.status !== "paid"}
        <Button
          type="button"
          variant="ghost"
          onclick={() => (confirmDeleteOpen = true)}
          class="text-destructive ml-auto"
        >
          <Trash2 />
          Löschen
        </Button>
      {/if}
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}

<ConfirmDialog
  bind:open={confirmDeleteOpen}
  title="Eingangsrechnung löschen?"
  description="Der Datensatz wird unwiderruflich entfernt."
  confirmLabel="Löschen"
  destructive
  onConfirm={onDelete}
/>

<ConfirmDialog
  bind:open={confirmCancelOpen}
  title="Eingangsrechnung stornieren?"
  description="Storno bleibt im System für die DATEV-Auswertung erhalten."
  confirmLabel="Stornieren"
  destructive
  onConfirm={onCancel}
/>
