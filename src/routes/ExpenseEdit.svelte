<script lang="ts">
  import { push } from "svelte-spa-router";
  import { untrack } from "svelte";
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
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
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
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { paidDateWarning } from "./invoice/date-warnings";
  import ExpenseItemsTable from "./parts/expense/ExpenseItemsTable.svelte";
  import PdfDropZone from "./parts/expense/PdfDropZone.svelte";
  import VendorQuickCreateDialog from "./parts/expense/VendorQuickCreateDialog.svelte";
  import { findDuplicateExpense, type ComparableExpense } from "./parts/expense/duplicate-check";
  import { vendorDraftFromOutcome } from "./parts/expense/vendor-draft";
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
  // Both save buttons submit the form, so the browser still enforces the required fields.
  let submitMode: AfterSave = "leave";

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
  const canAttachPdf = $derived(mode === "new" || (editable && existing !== null));
  const pdfZoneHint = $derived(
    mode === "new"
      ? undefined
      : pdfPath
        ? `Aktuell: ${pdfPath} — eine neue PDF ersetzt sie beim Speichern.`
        : "Noch keine PDF hinterlegt.",
  );
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
      toast.error("Lieferanten konnten nicht geladen werden", String(e));
    }
  }

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
      toast.error("Import fehlgeschlagen", String(e));
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

  async function saveExpense(): Promise<number | null> {
    const vendorId = parseId(form.vendorId);
    if (vendorId === null) {
      error = "Bitte Lieferant auswählen.";
      return null;
    }
    saving = true;
    error = null;
    try {
      await storePendingPdf(vendorId);
      const savedId = await persist(buildInput(vendorId));
      if (savedId !== null && validation) await recordValidation(savedId, validation);
      return savedId;
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
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
  }

  async function saveAndContinue(next: AfterSave) {
    const savedId = await saveExpense();
    if (savedId === null) return;
    if (next === "again") resetForNextExpense();
    else push("/expenses");
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
    const vendorId = parseId(form.vendorId);
    if (vendorId === null) {
      error = "Bitte Lieferant auswählen.";
      return;
    }
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
      push("/expenses");
    } catch (e) {
      toast.error(failureTitle, String(e));
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
      <Button type="button" variant="outline" onclick={openPaidDialog} disabled={saving}>
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
  {#if canAttachPdf}
    {#if mode === "new"}
      <PdfDropZone {importing} onFile={handleImport} />
    {:else}
      <PdfDropZone
        {importing}
        onFile={attachPdf}
        hint={pdfZoneHint}
        busyLabel="PDF wird vorbereitet…"
      />
    {/if}
    {#if importedNote}
      <p class="mb-4 text-xs text-muted-foreground">{importedNote}</p>
    {/if}
    {#if validation && mode === "new"}
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
            {#if editable}
              <p class="text-xs text-muted-foreground">
                {vendors.length === 0 ? "Noch keine Lieferanten —" : "Nicht dabei?"}
                <button type="button" class="underline" onclick={() => (vendorDialogOpen = true)}>
                  Lieferant anlegen
                </button>
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
        <Button type="submit" disabled={saving} onclick={() => (submitMode = "leave")}>
          {saving ? "Speichere…" : mode === "new" ? "Erfassen" : "Speichern"}
        </Button>
        {#if mode === "new"}
          <Button type="submit" variant="outline" disabled={saving} onclick={() => (submitMode = "again")}>
            Speichern & weitere erfassen
          </Button>
        {/if}
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
