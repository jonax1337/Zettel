<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
  import { push } from "svelte-spa-router";
  import { onDestroy, tick, untrack } from "svelte";
  import { listVendors, type VendorInput } from "$lib/db/queries";
  import {
    cancelExpense,
    computeTotals,
    createExpense,
    deleteExpense,
    getExpense,
    listCategories,
    listExpenses,
    markExpensePaid,
    recordExpenseValidation,
    updateExpense,
    type ExpenseFormInput,
  } from "$lib/db/expenses";
  import type { CatalogItem, Expense, ExpenseCategory, Vendor } from "$lib/db/schema";
  import { listCategories as listCuratedCategories } from "$lib/db/expense-categories";
  import { importExpensePdf } from "$lib/sidecar/extract";
  import { formatDate, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import ValidationBadge from "$lib/components/ValidationBadge.svelte";
  import {
    Button,
    CatalogPicker,
    Checkbox,
    ConfirmDialog,
    DatePicker,
    DropdownItem,
    DropdownMenu,
    Field,
    FormSection,
    Input,
    MoreActionsTrigger,
    PageHeader,
    SaveBar,
    Select,
    StatusBadge,
    Textarea,
    focusFirstInvalid,
    toast,
  } from "$lib/ui";
  import { Check, Package, Plus, Trash2, X } from "$lib/brand-icons";
  import { fetchEditTarget, parseId } from "./parts/entity/edit-target";
  import { centsToPriceText } from "./parts/entity/format";
  import { vatRateForNewItem } from "$lib/utils/vat";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { paidDateWarning } from "./invoice/date-warnings";
  import ExpenseItemsTable from "./parts/expense/ExpenseItemsTable.svelte";
  import PdfDropZone from "./parts/expense/PdfDropZone.svelte";
  import { hasErrors, validateExpenseForm } from "./parts/expense/form-validation";
  import { importWhenReady, takePendingImport } from "./parts/expense/pending-import";
  import VendorQuickCreateDialog from "./parts/expense/VendorQuickCreateDialog.svelte";
  import { findDuplicateExpense, type ComparableExpense } from "./parts/expense/duplicate-check";
  import { vendorDraftFromOutcome } from "./parts/expense/vendor-draft";
  import {
    applyInvoiceExtract,
    applyTextExtract,
    commitPendingPrices,
    emptyExpenseForm,
    emptyItemRow,
    isReverseCharge,
    itemInputFromRow,
    itemRowFromStored,
    type ExpenseFormState,
  } from "./parts/expense/expense-form";
  import { EXPENSE_STATUS } from "./parts/expense/expense-status";
  import {
    readExpensePdf,
    validateImportedPdf,
    type ImportValidation,
    type PdfReadOutcome,
  } from "./parts/expense/pdf-import";
  import { vendorFileSlug } from "./parts/expense/vendor-match";
  import { centsToEur } from "$lib/utils/money";

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
  // Field messages appear only after a failed save, then follow the form live.
  let attempted = $state(false);
  let formEl = $state<HTMLFormElement | null>(null);
  let vendorsLoaded = $state(false);
  let destroyed = false;
  onDestroy(() => (destroyed = true));
  // Taken when the editor is created, so a failed or abandoned load cannot leak it into a later editor.
  let queuedPdf = $state<string | null>(untrack(() => (mode === "new" ? takePendingImport() : null)));

  type AfterSave = "leave" | "again";

  const form = $state<ExpenseFormState>(emptyExpenseForm());
  let pdfPath = $state<string | null>(null);
  // Copied into the document folder only on save, so abandoning the form leaves no stray file.
  let pendingPdfSource = $state<string | null>(null);

  let confirmDeleteOpen = $state(false);
  let confirmCancelOpen = $state(false);
  let catalogPickerOpen = $state(false);
  let vendorDialogOpen = $state(false);
  let vendorDraft = $state<VendorInput | null>(null);
  let paidDialogOpen = $state(false);
  let paidDate = $state(toIsoDate(nowUnix()));
  let confirmDuplicateOpen = $state(false);
  let duplicateOf = $state<ComparableExpense | null>(null);
  let afterDuplicateConfirm = $state<AfterSave>("leave");
  // Both save buttons submit the form; this tells the handler which one was pressed.
  let submitMode: AfterSave = "leave";

  let importing = $state(false);
  let importedNote = $state<string | null>(null);
  let zugferdExtracted = $state(false);
  let validation = $state<ImportValidation | null>(null);

  const fieldErrors = $derived(attempted ? validateExpenseForm(form) : {});
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
  const loadFailed = $derived(mode === "edit" && loaded && existing === null);
  const canAttachPdf = $derived(mode === "new" || (editable && existing !== null));
  const pdfZoneHint = $derived(
    mode === "new"
      ? undefined
      : pdfPath
        ? `Aktuell: ${pdfPath}. Eine neue PDF ersetzt sie beim Speichern.`
        : "Noch keine PDF hinterlegt.",
  );
  const canCancel = $derived(existing?.status === "open");
  const canDelete = $derived(existing !== null && existing.status !== "paid");
  const paidWarning = $derived(
    paidDate && existing
      ? paidDateWarning(fromIsoDate(paidDate), { sentAt: null, issueDate: existing.issueDate }, nowUnix())
      : null,
  );
  const duplicateDescription = $derived(
    duplicateOf
      ? `Für diesen Lieferanten gibt es bereits ${duplicateOf.internalNumber}${duplicateOf.number ? ` (Beleg-Nr. ${duplicateOf.number})` : ""} über ${centsToEur(duplicateOf.total)}. Trotzdem speichern?`
      : "",
  );

  async function selectCreatedVendor(vendorId: number) {
    try {
      vendors = await listVendors();
      form.vendorId = String(vendorId);
    } catch (e) {
      toast.error("Lieferanten konnten nicht geladen werden", errorMessage(e));
    }
  }

  $effect(() => {
    const lookups = Promise.all([listVendors(), listCategories(), listCuratedCategories()])
      .then(([loadedVendors, suggestions, curated]) => {
        vendors = loadedVendors;
        categorySuggestions = suggestions;
        curatedCategories = curated;
      })
      .catch((e) => (error = errorMessage(e)))
      .finally(() => (vendorsLoaded = true));
    // A PDF dropped on the expense list is read once the vendors are known for matching.
    const dropped = untrack(() => queuedPdf);
    if (dropped) {
      void importWhenReady(dropped, lookups, () => !destroyed, (path) => {
        queuedPdf = null;
        return handleImport(path);
      });
    }
  });

  function onPdfFile(path: string) {
    if (queuedPdf) {
      toast.warning("Die abgelegte PDF wird noch gelesen", "Lege weitere Dateien danach ab.");
      return;
    }
    return handleImport(path);
  }

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
    fetchEditTarget(params?.id, getExpense, "Ausgabe nicht gefunden.")
      .then((target) => {
        if ("error" in target) {
          error = target.error;
          return;
        }
        id = target.id;
        applyStoredExpense(target.value);
      })
      .catch((e) => (error = errorMessage(e)))
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
    zugferdExtracted = outcome.kind === "zugferd";
    if (outcome.kind === "zugferd") {
      applyInvoiceExtract(form, outcome.data, outcome.vendor);
    } else if (outcome.kind === "text") {
      applyTextExtract(form, outcome.data, outcome.vendor);
    }
  }

  function announceImport(outcome: PdfReadOutcome) {
    const storedNote = "Die PDF wird beim Speichern abgelegt";
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
      {
        label: "Lieferant anlegen",
        onClick: () => {
          vendorDialogOpen = true;
        },
      },
      { description: "Kein passender Lieferant — bitte anlegen oder oben auswählen." },
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
      const matchedVendor = outcome.kind === "zugferd" || outcome.kind === "text" ? outcome.vendor : null;
      pendingPdfSource = srcPath;
      vendorDraft = matchedVendor ? null : vendorDraftFromOutcome(outcome);
      validation = outcome.kind === "zugferd" ? await validateImportedPdf(srcPath) : null;
      announceImport(outcome);
    } catch (e) {
      toast.error("Import fehlgeschlagen", errorMessage(e));
    } finally {
      importing = false;
    }
  }

  function attachPdf(srcPath: string) {
    pendingPdfSource = srcPath;
    importedNote = "Die neue PDF wird beim Speichern abgelegt.";
  }

  async function storePendingPdf(vendorId: number) {
    if (!pendingPdfSource) return;
    const vendor = vendors.find((v) => v.id === vendorId) ?? null;
    pdfPath = await importExpensePdf(pendingPdfSource, vendorFileSlug(vendor));
    // A failed save below must not copy the PDF a second time on retry.
    pendingPdfSource = null;
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
      toast.success("Ausgabe erfasst");
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
      toast.warning("Validierungsstatus nicht gespeichert", errorMessage(e));
    }
  }

  /** Returns the vendor id when the form is complete; otherwise the messages show next to their fields. */
  function validForm(): number | null {
    commitPendingPrices(form.items);
    attempted = true;
    const vendorId = parseId(form.vendorId);
    if (vendorId !== null && !hasErrors(validateExpenseForm(form))) return vendorId;
    // The sticky bar hides the fields; take the user to the first problem.
    void tick().then(() => formEl && focusFirstInvalid(formEl));
    return null;
  }

  async function saveExpense(): Promise<number | null> {
    const vendorId = validForm();
    if (vendorId === null) return null;
    saving = true;
    error = null;
    try {
      await storePendingPdf(vendorId);
      const savedId = await persist(buildInput(vendorId));
      if (savedId !== null && validation) await recordValidation(savedId, validation);
      return savedId;
    } catch (err) {
      error = errorMessage(err);
      toast.error("Speichern fehlgeschlagen", errorMessage(err));
      return null;
    } finally {
      saving = false;
    }
  }

  function resetForNextExpense() {
    Object.assign(form, emptyExpenseForm());
    pdfPath = null;
    pendingPdfSource = null;
    zugferdExtracted = false;
    validation = null;
    importedNote = null;
    vendorDraft = null;
    error = null;
    attempted = false;
  }

  async function saveAndContinue(next: AfterSave) {
    const savedId = await saveExpense();
    if (savedId === null) return;
    if (next === "again") resetForNextExpense();
    unsaved.markClean();
    if (next === "leave") push("/expenses");
  }

  /** A lookup failure must not block saving, so it counts as "no duplicate". */
  async function findDuplicate(vendorId: number): Promise<ComparableExpense | null> {
    const number = form.vendorNumber.trim() || null;
    const unchanged = existing?.vendorId === vendorId && existing.number === number;
    if (unchanged) return null;
    try {
      return findDuplicateExpense(await listExpenses({ vendorId }), {
        id,
        vendorId,
        number,
        issueDate: fromIsoDate(form.issueDateIso),
        total: totals.total,
      });
    } catch {
      return null;
    }
  }

  async function requestSave(next: AfterSave) {
    if (!editable || saving) return;
    const vendorId = validForm();
    if (vendorId === null) return;
    const duplicate = await findDuplicate(vendorId);
    if (duplicate) {
      duplicateOf = duplicate;
      afterDuplicateConfirm = next;
      confirmDuplicateOpen = true;
      return;
    }
    await saveAndContinue(next);
  }

  function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    return requestSave(submitMode);
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
      toast.error(failureTitle, errorMessage(e));
    }
  }

  function openPaidDialog() {
    paidDate = toIsoDate(nowUnix());
    paidDialogOpen = true;
  }

  /** Pending edits are saved first; otherwise leaving the page would silently drop them. */
  async function confirmPaid() {
    paidDialogOpen = false;
    if ((await saveExpense()) === null) return;
    const paidAt = fromIsoDate(paidDate);
    await updateStatusAndLeave(
      (expenseId) => markExpensePaid(expenseId, paidAt),
      "Als bezahlt markiert",
      "Fehler",
    );
  }
  const onCancel = () => updateStatusAndLeave(cancelExpense, "Storniert", "Fehler");
  const onDelete = () => updateStatusAndLeave(deleteExpense, "Gelöscht", "Löschen fehlgeschlagen");

  const unsaved = guardUnsavedChanges(
    () => [form, pdfPath],
    () => !loading,
  );
</script>

<div class="max-w-4xl">
  <PageHeader
    title={mode === "new" ? "Ausgabe erfassen" : existing ? `Ausgabe ${existing.internalNumber}` : "Ausgabe"}
    subtitle={mode === "new" ? "Lade den Beleg hoch oder trage die Angaben von Hand ein." : selectedVendor?.name}
    back={{ href: "/expenses", label: "Ausgaben" }}
  >
    {#snippet actions()}
      {#if canCancel || canDelete}
        <DropdownMenu>
          {#snippet trigger()}
            <MoreActionsTrigger />
          {/snippet}
          {#if canCancel}
            <DropdownItem destructive onSelect={() => (confirmCancelOpen = true)}>
              <X />
              Stornieren
            </DropdownItem>
          {/if}
          {#if canDelete}
            <DropdownItem destructive onSelect={() => (confirmDeleteOpen = true)}>
              <Trash2 />
              Löschen
            </DropdownItem>
          {/if}
        </DropdownMenu>
      {/if}
    {/snippet}
  </PageHeader>
</div>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if loadFailed}
  <p class="text-sm text-destructive" role="alert">{error ?? "Ausgabe nicht gefunden."}</p>
{:else}
  <form bind:this={formEl} onsubmit={onSubmit} novalidate class="max-w-4xl">
    <FormSection title="Beleg">
      {#if canAttachPdf}
        {#if mode === "new"}
          <PdfDropZone importing={importing || queuedPdf !== null} onFile={onPdfFile} />
        {:else}
          <PdfDropZone
            {importing}
            onFile={attachPdf}
            title="PDF hierher ziehen."
            hint={pdfZoneHint}
            busyLabel="PDF wird vorbereitet…"
          />
        {/if}
        {#if importedNote}
          <p class="mt-2 text-[13px] text-muted-foreground">{importedNote}</p>
        {/if}
        {#if validation && mode === "new"}
          <div class="mt-2 flex items-center gap-2">
            <ValidationBadge status={validation.status} findingsCount={validation.findingsCount} />
            {#if validation.status === "invalid"}
              <span class="text-[13px] text-destructive">Die XML des Lieferanten entspricht nicht der EN16931-Norm.</span>
            {/if}
          </div>
        {/if}
      {:else if pdfPath}
        <p class="text-sm text-muted-foreground">Beleg: {pdfPath}</p>
      {:else}
        <p class="text-sm text-muted-foreground">Für diese Ausgabe ist keine PDF hinterlegt.</p>
      {/if}
    </FormSection>

    <FormSection title="Lieferant und Beleg">
      <div class="grid max-w-2xl grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
        <Field
          label="Lieferant"
          required
          error={fieldErrors.vendor}
          hint={editable && vendorsLoaded && vendors.length === 0 ? "Du hast noch keinen Lieferanten angelegt." : undefined}
          class="sm:col-span-3"
        >
          <div class="flex items-center gap-2">
            <Select
              bind:value={form.vendorId}
              items={vendorItems}
              placeholder="Lieferant wählen…"
              disabled={!editable}
              class="flex-1"
            />
            {#if editable}
              <Button type="button" variant="outline" onclick={() => (vendorDialogOpen = true)}>
                <Plus />
                Lieferant anlegen
              </Button>
            {/if}
          </div>
        </Field>
        <Field label="Beleg-Nr. des Lieferanten">
          <Input bind:value={form.vendorNumber} placeholder="z. B. 2026-04-123" disabled={!editable} />
        </Field>
        <Field label="Rechnungsdatum" required error={fieldErrors.issueDate}>
          <DatePicker bind:value={form.issueDateIso} disabled={!editable} />
        </Field>
        <Field label="Fällig am">
          <DatePicker bind:value={form.dueDateIso} disabled={!editable} />
        </Field>
      </div>
    </FormSection>

    <FormSection title="Positionen">
      {#snippet actions()}
        <Button type="button" variant="outline" onclick={() => (catalogPickerOpen = true)} disabled={!editable}>
          <Package />
          Aus Katalog
        </Button>
        <Button type="button" variant="outline" onclick={addItem} disabled={!editable}>
          <Plus />
          Position
        </Button>
      {/snippet}
      <div class="mb-4 flex items-center gap-2">
        <Checkbox
          id="rc"
          disabled={!editable}
          bind:checked={
            () => reverseCharge, (checked) => (form.reverseChargeType = checked ? "intra_eu" : "none")
          }
        />
        <label for="rc" class="cursor-pointer select-none text-sm">
          Reverse-Charge (Steuerschuldnerschaft des Leistungsempfängers)
        </label>
      </div>
      <ExpenseItemsTable
        bind:items={form.items}
        {editable}
        {reverseCharge}
        {totals}
        {curatedCategories}
        {categorySuggestions}
        error={fieldErrors.items}
        descriptionRows={fieldErrors.descriptionRows}
        quantityRows={fieldErrors.quantityRows}
      />
    </FormSection>

    {#if existing}
      <FormSection title="Zahlung">
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <StatusBadge status={existing.status} table={EXPENSE_STATUS} />
          {#if existing.status === "paid" && existing.paidDate}
            <span class="text-muted-foreground">Bezahlt am {formatDate(existing.paidDate)}</span>
          {:else if existing.dueDate}
            <span class="text-muted-foreground">Fällig am {formatDate(existing.dueDate)}</span>
          {/if}
          {#if existing.zugferdExtracted}
            <span class="text-muted-foreground">Aus einer ZUGFeRD-Datei gelesen</span>
          {/if}
          {#if existing.status === "open"}
            <Button type="button" variant="outline" class="ml-auto" onclick={openPaidDialog} disabled={saving}>
              <Check />
              Als bezahlt markieren
            </Button>
          {/if}
        </div>
      </FormSection>
    {/if}

    <FormSection title="Notizen">
      <Field label="Interne Notiz" hint="Nur für dich, taucht auf keinem Beleg auf." class="max-w-2xl">
        <Textarea rows={3} bind:value={form.notes} disabled={!editable} />
      </Field>
    </FormSection>

    <SaveBar>
      {#if editable}
        <Button type="submit" disabled={saving} onclick={() => (submitMode = "leave")}>
          {saving ? "Speichere…" : "Speichern"}
        </Button>
        {#if mode === "new"}
          <Button type="submit" variant="outline" disabled={saving} onclick={() => (submitMode = "again")}>
            Speichern und weitere erfassen
          </Button>
        {/if}
      {/if}
      <Button type="button" variant="outline" onclick={() => push("/expenses")}>
        {editable ? "Abbrechen" : "Zurück"}
      </Button>
      {#if error}
        <span class="min-w-0 truncate text-sm text-destructive" role="alert" title={error}>{error}</span>
      {/if}
      <span class="ml-auto whitespace-nowrap tabular-nums text-muted-foreground">
        Gesamtbetrag
        <b class="ml-2 font-display text-lg font-extrabold text-foreground">{centsToEur(totals.total)}</b>
      </span>
    </SaveBar>
  </form>
{/if}

<ConfirmDialog
  bind:open={confirmDeleteOpen}
  title="Ausgabe löschen?"
  description="Der Datensatz wird unwiderruflich entfernt."
  confirmLabel="Löschen"
  destructive
  onConfirm={onDelete}
/>

<ConfirmDialog
  bind:open={confirmCancelOpen}
  title="Ausgabe stornieren?"
  description="Storno bleibt im System für die DATEV-Auswertung erhalten."
  confirmLabel="Stornieren"
  destructive
  onConfirm={onCancel}
/>

<CatalogPicker bind:open={catalogPickerOpen} onPick={addFromCatalog} />

<VendorQuickCreateDialog bind:open={vendorDialogOpen} prefill={vendorDraft} onCreated={selectCreatedVendor} />

<DateConfirmDialog
  bind:open={paidDialogOpen}
  bind:date={paidDate}
  title="Als bezahlt markieren"
  description="Zahldatum für Statistik und DATEV-Export. Offene Änderungen werden vorher gespeichert."
  dateInputId="expense-paid-date"
  dateLabel="Zahldatum"
  hint="Standard ist heute. Bei Nacherfassung das echte Zahldatum eintragen."
  confirmLabel="Bestätigen"
  warning={paidWarning}
  onConfirm={confirmPaid}
/>

<ConfirmDialog
  bind:open={confirmDuplicateOpen}
  title="Mögliche Dublette"
  description={duplicateDescription}
  confirmLabel="Trotzdem speichern"
  onConfirm={() => saveAndContinue(afterDuplicateConfirm)}
/>
