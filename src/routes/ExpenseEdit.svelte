<script lang="ts">
  import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
  import { link, push } from "svelte-spa-router";
  import { untrack } from "svelte";
  import { listVendors } from "$lib/db/queries";
  import {
    cancelExpense,
    computeTotals,
    createExpense,
    deleteExpense,
    getExpense,
    listCategories,
    markExpensePaid,
    recordExpenseValidation,
    updateExpense,
    type ExpenseFormInput,
  } from "$lib/db/expenses";
  import type { CatalogItem, Expense, ExpenseCategory, Vendor } from "$lib/db/schema";
  import { listCategories as listCuratedCategories } from "$lib/db/expense-categories";
  import { importExpensePdf } from "$lib/sidecar/extract";
  import { fromIsoDate, toIsoDate } from "$lib/utils/date";
  import ValidationBadge from "$lib/components/ValidationBadge.svelte";
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
    Badge,
    Checkbox,
    ConfirmDialog,
    toast,
  } from "$lib/ui";
  import { Check, X, Trash2 } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { fetchEditTarget, parseId } from "./parts/entity/edit-target";
  import { centsToPriceText } from "./parts/entity/format";
  import { vatRateForNewItem } from "./parts/entity/vat";
  import ExpenseItemsTable from "./parts/expense/ExpenseItemsTable.svelte";
  import PdfDropZone from "./parts/expense/PdfDropZone.svelte";
  import {
    applyInvoiceExtract,
    applyTextExtract,
    emptyExpenseForm,
    emptyItemRow,
    isReverseCharge,
    itemInputFromRow,
    itemRowFromStored,
    type ExpenseFormState,
  } from "./parts/expense/expense-form";
  import { EXPENSE_STATUS_LABEL, EXPENSE_STATUS_VARIANT } from "./parts/expense/expense-status";
  import {
    readExpensePdf,
    validateImportedPdf,
    type ImportValidation,
    type PdfReadOutcome,
  } from "./parts/expense/pdf-import";
  import { vendorFileSlug } from "./parts/expense/vendor-match";

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  let vendors = $state<Vendor[]>([]);
  let categorySuggestions = $state<string[]>([]);
  let curatedCategories = $state<ExpenseCategory[]>([]);
  let id = $state<number | null>(null);
  let existing = $state<Expense | null>(null);
  let loaded = $state(false);
  const loading = $derived(mode === "edit" && !loaded);

  let saving = $state(false);
  let error = $state<string | null>(null);

  const form = $state<ExpenseFormState>(emptyExpenseForm());
  let pdfPath = $state<string | null>(null);

  let confirmDeleteOpen = $state(false);
  let confirmCancelOpen = $state(false);
  let catalogPickerOpen = $state(false);

  let importing = $state(false);
  let importedNote = $state<string | null>(null);
  let zugferdExtracted = $state(false);
  let validation = $state<ImportValidation | null>(null);

  const reverseCharge = $derived(isReverseCharge(form));
  const selectedVendor = $derived(vendors.find((v) => String(v.id) === form.vendorId) ?? null);
  const totals = $derived(computeTotals(form.items, { isReverseCharge: reverseCharge }));
  const editable = $derived(
    mode === "new" ||
      (existing !== null && existing.status !== "paid" && existing.status !== "cancelled"),
  );
  const vendorItems = $derived(
    vendors.map((v) => ({ value: String(v.id), label: `${v.vendorNumber} — ${v.name}` })),
  );

  $effect(() => {
    Promise.all([listVendors(), listCategories(), listCuratedCategories()])
      .then(([loadedVendors, suggestions, curated]) => {
        vendors = loadedVendors;
        categorySuggestions = suggestions;
        curatedCategories = curated;
      })
      .catch((e) => (error = String(e)));
  });

  // Only when the vendor changes: a user who clears a category must not get it refilled.
  $effect(() => {
    const defaultCategory = selectedVendor?.defaultCategory;
    if (mode !== "new" || !defaultCategory) return;
    untrack(() => {
      for (const item of form.items) item.category ||= defaultCategory;
    });
  });

  $effect(() => {
    if (!reverseCharge) return;
    for (const item of form.items) item.vatRate = 0;
  });

  $effect(() => {
    if (mode !== "edit") return;
    fetchEditTarget(params?.id, getExpense, "Eingangsrechnung nicht gefunden.")
      .then((target) => {
        if ("error" in target) {
          error = target.error;
          return;
        }
        id = target.id;
        applyStoredExpense(target.value);
      })
      .catch((e) => (error = String(e)))
      .finally(() => (loaded = true));
  });

  function applyStoredExpense({ expense, items }: NonNullable<Awaited<ReturnType<typeof getExpense>>>) {
    existing = expense;
    pdfPath = expense.pdfPath;
    form.vendorId = String(expense.vendorId);
    form.vendorNumber = expense.number ?? "";
    form.issueDateIso = toIsoDate(expense.issueDate);
    form.dueDateIso = expense.dueDate ? toIsoDate(expense.dueDate) : "";
    form.notes = expense.notes ?? "";
    form.reverseChargeType = expense.reverseChargeType;
    form.items = items.map(itemRowFromStored);
  }

  function addItem() {
    form.items.push(
      emptyItemRow({
        category: selectedVendor?.defaultCategory ?? null,
        vatRate: vatRateForNewItem(reverseCharge),
      }),
    );
  }

  function addFromCatalog(catalogItem: CatalogItem) {
    form.items.push(
      emptyItemRow({
        description: catalogItem.name + (catalogItem.descriptionDe ? ` — ${catalogItem.descriptionDe}` : ""),
        category: selectedVendor?.defaultCategory ?? null,
        datevAccount: catalogItem.defaultDatevAccount ?? null,
        unit: catalogItem.unit,
        unitPrice: catalogItem.defaultUnitPrice,
        vatRate: reverseCharge ? 0 : catalogItem.defaultVatRate,
        priceText: centsToPriceText(catalogItem.defaultUnitPrice),
      }),
    );
  }

  function applyReadOutcome(outcome: PdfReadOutcome) {
    if (outcome.kind === "zugferd") {
      zugferdExtracted = true;
      applyInvoiceExtract(form, outcome.data, outcome.vendor);
    } else if (outcome.kind === "text") {
      applyTextExtract(form, outcome.data, outcome.vendor);
    }
  }

  function announceImport(outcome: PdfReadOutcome, storedAt: string) {
    const storedNote = `PDF abgelegt unter ${storedAt}`;
    switch (outcome.kind) {
      case "zugferd":
        announceZugferdImport(outcome.vendor, storedNote);
        break;
      case "text":
        toast.warning(
          "Keine ZUGFeRD-XML — Text-Heuristik genutzt",
          outcome.vendor
            ? `Lieferant „${outcome.vendor.name}" via Text-Match zugeordnet. Bitte alle Felder prüfen.`
            : "Felder bestmöglich vorbefüllt — bitte alle Werte prüfen.",
        );
        importedNote = `${storedNote}. Heuristisch vorbefüllt — Werte prüfen!`;
        break;
      case "extract-failed":
        toast.error("ZUGFeRD-Extract fehlgeschlagen", outcome.message);
        importedNote = storedNote;
        break;
      case "empty":
        toast.warning(
          "Kein extrahierbarer Inhalt in der PDF",
          "Weder ZUGFeRD-XML noch Text-Layer gefunden — bitte manuell erfassen.",
        );
        importedNote = storedNote;
        break;
    }
  }

  function announceZugferdImport(vendor: Vendor | null, storedNote: string) {
    if (vendor) {
      toast.success("ZUGFeRD übernommen", `Lieferant „${vendor.name}" automatisch zugeordnet.`);
      importedNote = storedNote;
      return;
    }
    toast.action(
      "ZUGFeRD übernommen",
      { label: "Lieferant anlegen", onClick: () => push("/vendors/new") },
      { description: "Kein passender Lieferant — bitte vorher anlegen oder oben auswählen." },
    );
    importedNote = `${storedNote}. Lieferant fehlt.`;
  }

  async function handleImport(srcPath: string) {
    if (importing) return;
    importing = true;
    importedNote = null;
    try {
      const outcome = await readExpensePdf(srcPath, vendors);
      applyReadOutcome(outcome);
      const vendor = outcome.kind === "zugferd" || outcome.kind === "text" ? outcome.vendor : null;
      const storedAt = await importExpensePdf(srcPath, vendorFileSlug(vendor));
      pdfPath = storedAt;
      validation = outcome.kind === "zugferd" ? await validateImportedPdf(storedAt) : null;
      announceImport(outcome, storedAt);
    } catch (e) {
      toast.error("Import fehlgeschlagen", String(e));
    } finally {
      importing = false;
    }
  }

  function buildInput(vendorId: number): ExpenseFormInput {
    return {
      number: form.vendorNumber.trim() || null,
      vendorId,
      issueDate: fromIsoDate(form.issueDateIso),
      dueDate: form.dueDateIso ? fromIsoDate(form.dueDateIso) : null,
      notes: form.notes.trim() || null,
      reverseChargeType: form.reverseChargeType,
      pdfPath,
      items: form.items.map(itemInputFromRow),
    };
  }

  async function persist(input: ExpenseFormInput): Promise<number | null> {
    if (mode === "new") {
      const createdId = await createExpense(input, { zugferdExtracted });
      toast.success("Eingangsrechnung erfasst");
      return createdId;
    }
    if (id === null) return null;
    await updateExpense(id, input);
    toast.success("Änderungen gespeichert");
    return id;
  }

  /** Validation is metadata, not core data, so a failure here must not undo the save. */
  async function recordValidation(expenseId: number, result: ImportValidation) {
    try {
      await recordExpenseValidation(expenseId, result.status, result.findingsCount);
    } catch (e) {
      toast.warning("Validierungsstatus nicht gespeichert", String(e));
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!editable) return;
    const vendorId = parseId(form.vendorId);
    if (vendorId === null) {
      error = "Bitte Lieferant auswählen.";
      return;
    }
    saving = true;
    error = null;
    try {
      const savedId = await persist(buildInput(vendorId));
      if (savedId !== null && validation) await recordValidation(savedId, validation);
      unsaved.markClean();
      push("/expenses");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }

  async function updateStatusAndLeave(
    action: (expenseId: number) => Promise<void>,
    successMessage: string,
    failureTitle: string,
  ) {
    if (id === null) return;
    try {
      await action(id);
      toast.success(successMessage);
      unsaved.markClean();
      push("/expenses");
    } catch (e) {
      toast.error(failureTitle, String(e));
    }
  }

  const onMarkPaid = () =>
    updateStatusAndLeave((expenseId) => markExpensePaid(expenseId), "Als bezahlt markiert", "Fehler");
  const onCancel = () => updateStatusAndLeave(cancelExpense, "Storniert", "Fehler");
  const onDelete = () => updateStatusAndLeave(deleteExpense, "Gelöscht", "Löschen fehlgeschlagen");

  const unsaved = guardUnsavedChanges(
    () => [form, pdfPath],
    () => !loading,
  );
</script>

<header class="mb-6 flex items-start justify-between gap-4">
  <div>
    <BackLink href="/expenses">Eingangsrechnungen</BackLink>
    <h1 class="text-3xl font-semibold tracking-tight mt-2">
      {mode === "new" ? "Neue Eingangsrechnung" : existing ? existing.internalNumber : "—"}
    </h1>
    {#if existing}
      <div class="mt-2 flex items-center gap-2">
        <Badge variant={EXPENSE_STATUS_VARIANT[existing.status]}>{EXPENSE_STATUS_LABEL[existing.status]}</Badge>
        {#if existing.zugferdExtracted}
          <Badge variant="secondary">ZUGFeRD-Import</Badge>
        {/if}
      </div>
    {/if}
  </div>
  {#if existing?.status === "open"}
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
  {#if mode === "new"}
    <PdfDropZone {importing} onFile={handleImport} />
    {#if importedNote}
      <p class="mb-4 text-xs text-muted-foreground">{importedNote}</p>
    {/if}
    {#if validation}
      <div class="mb-4 flex items-center gap-2">
        <ValidationBadge status={validation.status} findingsCount={validation.findingsCount} />
        {#if validation.status === "invalid"}
          <span class="text-xs text-destructive">
            Lieferanten-XML entspricht nicht der EN16931-Norm.
          </span>
        {/if}
      </div>
    {/if}
  {/if}
  <form onsubmit={onSubmit}>
    <Card>
      <CardContent class="space-y-6">
        <section class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Lieferant <span class="text-destructive">*</span></Label>
            <Select bind:value={form.vendorId} items={vendorItems} placeholder="Lieferant wählen…" />
            {#if vendors.length === 0}
              <p class="text-xs text-muted-foreground">
                Noch keine Lieferanten —
                <a href="/vendors/new" use:link class="underline">jetzt anlegen</a>.
              </p>
            {/if}
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Beleg-Nr. des Lieferanten</Label>
            <Input bind:value={form.vendorNumber} placeholder="z. B. 2026-04-123" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Rechnungsdatum <span class="text-destructive">*</span></Label>
            <DatePicker bind:value={form.issueDateIso} required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Fällig am</Label>
            <DatePicker bind:value={form.dueDateIso} />
          </div>
          <div class="col-span-2 flex items-center gap-2">
            <Checkbox
              id="rc"
              bind:checked={
                () => reverseCharge, (checked) => (form.reverseChargeType = checked ? "intra_eu" : "none")
              }
            />
            <label for="rc" class="text-sm cursor-pointer select-none">
              Reverse-Charge (Steuerschuldnerschaft des Leistungsempfängers)
            </label>
          </div>
        </section>
      </CardContent>
    </Card>

    <ExpenseItemsTable
      bind:items={form.items}
      {editable}
      {reverseCharge}
      {totals}
      {curatedCategories}
      {categorySuggestions}
      onAdd={addItem}
      onAddFromCatalog={() => (catalogPickerOpen = true)}
    />

    <Card class="mt-6">
      <CardContent class="space-y-4">
        <div class="flex flex-col gap-1.5">
          <Label>Notizen</Label>
          <Textarea rows={3} bind:value={form.notes} disabled={!editable} />
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
      {#if existing && existing.status !== "paid"}
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

<CatalogPicker bind:open={catalogPickerOpen} onPick={addFromCatalog} />
