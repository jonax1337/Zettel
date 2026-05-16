<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { onMount } from "svelte";
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
    extractZugferd,
    extractTextPdf,
    importExpensePdf,
    type ExtractedInvoice,
    type ExtractedText,
  } from "$lib/sidecar/extract";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
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
  import { ArrowLeft, Plus, Trash2, Check, X, FileUp, Loader2 } from "@lucide/svelte";

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

  let importing = $state(false);
  let dropHover = $state(false);
  let pdfPath = $state<string | null>(null);
  let importedNote = $state<string | null>(null);
  let zugferdExtracted = $state(false);

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
          pdfPath = res.expense.pdfPath;
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

  // --- ZUGFeRD-Import ---

  function vendorSlug(v: Vendor | null): string | undefined {
    if (!v) return undefined;
    return `${v.vendorNumber}-${v.name}`
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function matchVendor(seller: ExtractedInvoice["seller"]): Vendor | null {
    if (seller.vatId) {
      const byVat = vendors.find(
        (v) => v.vatId && v.vatId.replace(/\s+/g, "").toUpperCase() ===
          (seller.vatId ?? "").replace(/\s+/g, "").toUpperCase(),
      );
      if (byVat) return byVat;
    }
    if (seller.name) {
      const sn = seller.name.toLowerCase().trim();
      const byName = vendors.find((v) => v.name.toLowerCase().trim() === sn);
      if (byName) return byName;
    }
    return null;
  }

  function applyExtract(data: ExtractedInvoice, matched: Vendor | null) {
    if (matched) vendorIdStr = String(matched.id);
    if (data.invoiceNumber) vendorNumber = data.invoiceNumber;
    if (data.issueDate) issueDateIso = toIsoDate(data.issueDate);
    if (data.dueDate) dueDateIso = toIsoDate(data.dueDate);
    reverseCharge = data.reverseChargeType !== "none";
    if (data.lineItems.length > 0) {
      items = data.lineItems.map((li) => ({
        description: li.description,
        category: matched?.defaultCategory ?? null,
        datevAccount: null,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitPrice,
        vatRate: li.vatRate,
        priceText: (li.unitPrice / 100).toFixed(2).replace(".", ","),
      }));
    }
  }

  function matchVendorByName(name: string | null): Vendor | null {
    if (!name) return null;
    const sn = name.toLowerCase().trim();
    return (
      vendors.find((v) => v.name.toLowerCase().trim() === sn) ??
      vendors.find((v) => v.name.toLowerCase().includes(sn) || sn.includes(v.name.toLowerCase())) ??
      null
    );
  }

  function matchVendorByVatId(vatId: string | null): Vendor | null {
    if (!vatId) return null;
    const norm = vatId.replace(/\s+/g, "").toUpperCase();
    return (
      vendors.find(
        (v) => v.vatId && v.vatId.replace(/\s+/g, "").toUpperCase() === norm,
      ) ?? null
    );
  }

  function applyTextExtract(data: ExtractedText, matched: Vendor | null) {
    if (matched) vendorIdStr = String(matched.id);
    if (data.invoiceNumber) vendorNumber = data.invoiceNumber;
    if (data.issueDate) issueDateIso = toIsoDate(data.issueDate);
    if (data.dueDate) dueDateIso = toIsoDate(data.dueDate);
    if (data.totalCents && data.totalCents > 0 && items.length === 1 && items[0].unitPrice === 0) {
      items[0].description = data.invoiceNumber
        ? `Eingangsrechnung ${data.invoiceNumber}`
        : "Eingangsrechnung (heuristisch)";
      items[0].quantity = 1;
      items[0].unit = "Pauschal";
      items[0].vatRate = reverseCharge ? 0 : 19;
      const net = reverseCharge
        ? data.totalCents
        : Math.round(data.totalCents / (1 + items[0].vatRate / 100));
      items[0].unitPrice = net;
      items[0].priceText = (net / 100).toFixed(2).replace(".", ",");
      items = [...items];
    }
  }

  async function handleImport(srcPath: string) {
    if (importing) return;
    importing = true;
    importedNote = null;
    try {
      const result = await extractZugferd(srcPath);
      let matched: Vendor | null = null;
      let foundXml = false;
      let textHeuristicUsed = false;
      if (result.success && result.found) {
        foundXml = true;
        zugferdExtracted = true;
        matched = matchVendor(result.data.seller);
        applyExtract(result.data, matched);
      } else if (result.success === false) {
        toast.error("ZUGFeRD-Extract fehlgeschlagen", result.error.message);
      } else {
        // No ZUGFeRD attachment — fall back to text-layer heuristic.
        const textResult = await extractTextPdf(srcPath);
        if (textResult.success && textResult.found) {
          textHeuristicUsed = true;
          matched =
            matchVendorByVatId(textResult.data.vendorVatId) ??
            matchVendorByName(textResult.data.vendorName);
          applyTextExtract(textResult.data, matched);
        }
      }
      const dest = await importExpensePdf(srcPath, vendorSlug(matched));
      pdfPath = dest;
      if (foundXml) {
        if (matched) {
          toast.success("ZUGFeRD übernommen", `Lieferant „${matched.name}" automatisch zugeordnet.`);
          importedNote = `PDF abgelegt unter ${dest}`;
        } else {
          toast.action(
            "ZUGFeRD übernommen",
            { label: "Lieferant anlegen", onClick: () => push("/vendors/new") },
            { description: "Kein passender Lieferant — bitte vorher anlegen oder oben auswählen." },
          );
          importedNote = `PDF abgelegt unter ${dest}. Lieferant fehlt.`;
        }
      } else if (textHeuristicUsed) {
        toast.warning(
          "Keine ZUGFeRD-XML — Text-Heuristik genutzt",
          matched
            ? `Lieferant „${matched.name}" via Text-Match zugeordnet. Bitte alle Felder prüfen.`
            : "Felder bestmöglich vorbefüllt — bitte alle Werte prüfen.",
        );
        importedNote = `PDF abgelegt unter ${dest}. Heuristisch vorbefüllt — Werte prüfen!`;
      } else {
        toast.warning(
          "Kein extrahierbarer Inhalt in der PDF",
          "Weder ZUGFeRD-XML noch Text-Layer gefunden — bitte manuell erfassen.",
        );
        importedNote = `PDF abgelegt unter ${dest}`;
      }
    } catch (e) {
      toast.error("Import fehlgeschlagen", String(e));
    } finally {
      importing = false;
    }
  }

  async function pickFile() {
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (typeof selected === "string") {
        await handleImport(selected);
      }
    } catch (e) {
      toast.error("Datei-Dialog fehlgeschlagen", String(e));
    }
  }

  onMount(() => {
    if (mode !== "new") return;
    let unlisten: (() => void) | null = null;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          dropHover = true;
        } else if (event.payload.type === "leave") {
          dropHover = false;
        } else if (event.payload.type === "drop") {
          dropHover = false;
          const paths = event.payload.paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
          if (paths.length > 0) {
            void handleImport(paths[0]);
          } else if (event.payload.paths.length > 0) {
            toast.warning("Nur PDF-Dateien werden unterstützt.");
          }
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  });

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
        pdfPath: pdfPath ?? existing?.pdfPath ?? null,
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
        await createExpense(input, { zugferdExtracted });
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
  {#if mode === "new"}
    <div
      class={"mb-6 rounded-lg border-2 border-dashed p-6 text-center transition-colors " +
        (dropHover
          ? "border-primary bg-primary/5"
          : importing
            ? "border-muted bg-muted/30"
            : "border-muted-foreground/25 hover:border-muted-foreground/50")}
    >
      {#if importing}
        <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
          <span>ZUGFeRD-Daten werden gelesen…</span>
        </div>
      {:else}
        <div class="flex flex-col items-center gap-3">
          <FileUp class="size-8 text-muted-foreground" />
          <div class="text-sm">
            <span class="font-medium">PDF hierher ziehen</span>
            <span class="text-muted-foreground"> oder </span>
            <button
              type="button"
              onclick={pickFile}
              class="font-medium text-primary hover:underline"
            >
              Datei auswählen
            </button>
          </div>
          <p class="text-xs text-muted-foreground">
            ZUGFeRD/Factur-X-Daten werden automatisch übernommen.
          </p>
        </div>
      {/if}
    </div>
    {#if importedNote}
      <p class="mb-4 text-xs text-muted-foreground">{importedNote}</p>
    {/if}
  {/if}
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
