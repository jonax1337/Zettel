<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { listCustomers, loadSettings } from "$lib/db/queries";
  import {
    addAttachment,
    listAttachments,
    removeAttachment,
  } from "$lib/db/attachments";
  import type { InvoiceAttachment } from "$lib/db/schema";
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
    Badge,
    Button,
    ConfirmDialog,
    Input,
    Textarea,
    Label,
    Card,
    CardContent,
    DatePicker,
    Select,
    toast,
  } from "$lib/ui";
  import { ArrowLeft, Plus, Trash2, AlertTriangle, Paperclip, FileUp, Loader2 } from "@lucide/svelte";

  type CreditStatus = "good" | "caution" | "blocked";
  function creditVariant(s: CreditStatus): "success" | "warning" | "destructive" {
    if (s === "blocked") return "destructive";
    if (s === "caution") return "warning";
    return "success";
  }
  function creditLabel(s: CreditStatus): string {
    if (s === "blocked") return "Gesperrt";
    if (s === "caution") return "Vorsicht";
    return "Gut";
  }

  type Props = {
    mode: "new" | "edit";
    params?: { id?: string };
  };
  let { mode, params }: Props = $props();

  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);
  let id = $state<number | null>(null);
  let invoiceNumber = $state<string>("");
  let attachments = $state<InvoiceAttachment[]>([]);
  let attachmentBusy = $state(false);
  let dropHover = $state(false);
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
  let reverseChargeType = $state<ReverseChargeType>("none");
  const isReverseCharge = $derived(reverseChargeType !== "none");
  let isCreditNote = $state(false);
  let correctsInvoiceId = $state<number | null>(null);
  let items = $state<Array<InvoiceItemInput & { priceText: string }>>([
    { description: "", quantity: 1, unit: "Stk", unitPrice: 0, vatRate: 0, priceText: "" },
  ]);
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

  let blockedConfirmOpen = $state(false);
  let pendingCustomerIdStr = $state<string>("");
  let previousCustomerIdStr = $state<string>("");
  const pendingBlockedCustomer = $derived(
    pendingCustomerIdStr ? customers.find((c) => String(c.id) === pendingCustomerIdStr) ?? null : null,
  );

  function onCustomerChange(next: string) {
    if (mode === "new" && next) {
      const target = customers.find((c) => String(c.id) === next);
      if (target?.creditStatus === "blocked") {
        pendingCustomerIdStr = next;
        previousCustomerIdStr = customerIdStr;
        customerIdStr = next;
        blockedConfirmOpen = true;
        return;
      }
    }
    customerIdStr = next;
  }

  function confirmBlocked() {
    pendingCustomerIdStr = "";
  }

  function cancelBlocked() {
    customerIdStr = previousCustomerIdStr;
    pendingCustomerIdStr = "";
  }

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
          listAttachments(res.invoice.id)
            .then((list) => (attachments = list))
            .catch(() => (attachments = []));
          issueDateIso = toIsoDate(res.invoice.issueDate);
          deliveryDateIso = res.invoice.deliveryDate
            ? toIsoDate(res.invoice.deliveryDate)
            : "";
          dueDateIso = toIsoDate(res.invoice.dueDate);
          notes = res.invoice.notes ?? "";
          paymentTerms = res.invoice.paymentTerms ?? "";
          reverseChargeType = res.invoice.reverseChargeType;
          isCreditNote = res.invoice.isCreditNote;
          correctsInvoiceId = res.invoice.correctsInvoiceId;
          currency = res.invoice.currency ?? "EUR";
          exchangeRate = res.invoice.exchangeRate ?? "";
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

  type AttachmentRef = {
    filename: string;
    contentHash: string;
    mimeType: string;
    fileSize: number;
    storedPath: string;
  };

  const canAttach = $derived(mode === "edit" && id !== null && !!invoiceNumber);

  async function handleAttachmentFile(sourcePath: string, displayName?: string) {
    if (!canAttach || id === null) return;
    attachmentBusy = true;
    try {
      const filename = displayName ?? sourcePath.split(/[\\/]/).pop() ?? "anhang.pdf";
      const ref = await invoke<AttachmentRef>("import_invoice_attachment", {
        invoiceNumber,
        sourcePath,
        filename,
      });
      await addAttachment({
        invoiceId: id,
        filename: ref.filename,
        contentHash: ref.contentHash,
        mimeType: ref.mimeType,
        fileSize: ref.fileSize,
      });
      attachments = await listAttachments(id);
      if (ref.fileSize > 10 * 1024 * 1024) {
        toast.warning(
          "Großer Anhang",
          `${ref.filename} ist ${(ref.fileSize / (1024 * 1024)).toFixed(1)} MB — die PDF wird entsprechend groß.`,
        );
      } else {
        toast.success("Anhang hinzugefügt", ref.filename);
      }
    } catch (e) {
      toast.error("Anhang fehlgeschlagen", String(e));
    } finally {
      attachmentBusy = false;
    }
  }

  async function onPickAttachment() {
    if (!canAttach) return;
    try {
      const selected = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (typeof selected === "string") {
        await handleAttachmentFile(selected);
      }
    } catch (e) {
      toast.error("Datei-Dialog fehlgeschlagen", String(e));
    }
  }

  async function onRemoveAttachment(att: InvoiceAttachment) {
    if (id === null) return;
    try {
      const { attachmentStoredPath } = await import("$lib/db/attachments");
      const stored = await attachmentStoredPath(invoiceNumber, att.filename, att.contentHash);
      await removeAttachment(att.id);
      try {
        await invoke("delete_invoice_attachment", { storedPath: stored });
      } catch {
        // fs delete is best-effort; DB row is gone either way.
      }
      attachments = await listAttachments(id);
      toast.success("Anhang entfernt");
    } catch (e) {
      toast.error("Entfernen fehlgeschlagen", String(e));
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  onMount(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!canAttach) return;
        if (event.payload.type === "over") {
          dropHover = true;
        } else if (event.payload.type === "leave") {
          dropHover = false;
        } else if (event.payload.type === "drop") {
          dropHover = false;
          const pdfPaths = event.payload.paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
          if (pdfPaths.length === 0) {
            if (event.payload.paths.length > 0)
              toast.warning("Nur PDF-Anhänge werden unterstützt.");
            return;
          }
          (async () => {
            for (const p of pdfPaths) {
              await handleAttachmentFile(p);
            }
          })();
        }
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  });

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
    saving = true;
    error = null;
    try {
      const eurTotalCent =
        currency === "EUR"
          ? totals.total
          : computeEurTotalCent(currency, totals.total, exchangeRate);
      const input: InvoiceFormInput = {
        customerId,
        issueDate: fromIsoDate(issueDateIso),
        deliveryDate: deliveryDateIso ? fromIsoDate(deliveryDateIso) : null,
        dueDate: fromIsoDate(dueDateIso),
        notes: notes.trim() || null,
        paymentTerms: paymentTerms.trim() || null,
        reverseChargeType,
        items: items.map(({ priceText: _p, ...rest }) => rest),
        currency,
        exchangeRate: currency === "EUR" ? null : exchangeRate.trim(),
        eurTotalCent,
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
    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4" /> Rechnungen
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
              value={customerIdStr}
              onValueChange={onCustomerChange}
              items={customerItems}
              placeholder="— bitte wählen —"
              disabled={isCreditNote}
            />
            {#if selectedCustomer}
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{selectedCustomer.name}</span>
                <Badge variant={creditVariant(selectedCustomer.creditStatus)}>
                  {creditLabel(selectedCustomer.creditStatus)}
                </Badge>
              </div>
            {/if}
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
            <Label>Liefer-/Leistungsdatum</Label>
            <DatePicker bind:value={deliveryDateIso} />
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

    {#if !isCreditNote}
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
            PDF-Anhänge (Leistungsnachweise, etc.)
          </h2>
        </div>
        <Card>
          <CardContent class="space-y-3">
            <div
              class={"rounded-lg border-2 border-dashed p-5 text-center transition-colors " +
                (!canAttach
                  ? "border-muted-foreground/15 bg-muted/20"
                  : dropHover
                    ? "border-primary bg-primary/5"
                    : attachmentBusy
                      ? "border-muted bg-muted/30"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50")}
              title={!canAttach ? "Erst Entwurf speichern, dann Anhänge hinzufügen" : undefined}
            >
              {#if attachmentBusy}
                <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 class="size-4 animate-spin" />
                  <span>Anhang wird importiert…</span>
                </div>
              {:else if !canAttach}
                <div class="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Paperclip class="size-6" />
                  <span>Erst Entwurf speichern, dann Anhänge hinzufügen.</span>
                </div>
              {:else}
                <div class="flex flex-col items-center gap-3">
                  <FileUp class="size-7 text-muted-foreground" />
                  <div class="text-sm">
                    <span class="font-medium">PDF hierher ziehen</span>
                    <span class="text-muted-foreground"> oder </span>
                    <button
                      type="button"
                      onclick={onPickAttachment}
                      class="underline underline-offset-2 hover:text-foreground"
                    >Datei auswählen</button>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    Wird beim PDF-Generieren an die Rechnung angehängt (vor der ZUGFeRD-Einbettung).
                  </p>
                </div>
              {/if}
            </div>

            {#if attachments.length > 0}
              <ul class="divide-y divide-border rounded-md border border-border">
                {#each attachments as att (att.id)}
                  <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div class="flex items-center gap-2 min-w-0">
                      <Paperclip class="size-4 text-muted-foreground shrink-0" />
                      <span class="truncate" title={att.filename}>{att.filename}</span>
                      <span class="text-xs text-muted-foreground shrink-0">
                        · {formatBytes(att.fileSize)}
                      </span>
                      {#if att.mimeType !== "application/pdf"}
                        <span class="text-xs text-amber-600 dark:text-amber-500 shrink-0">
                          · wird nicht in die Rechnungs-PDF eingebettet
                        </span>
                      {/if}
                    </div>
                    <button
                      type="button"
                      onclick={() => onRemoveAttachment(att)}
                      class="inline-flex items-center justify-center size-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Anhang entfernen"
                      aria-label="Anhang entfernen"
                    >
                      <Trash2 class="size-4" />
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </CardContent>
        </Card>
      </section>
    {/if}

    <Card>
      <CardContent class="space-y-4">
        {#if !isCreditNote}
          <div class="flex flex-col gap-1.5">
            <Label>Zahlungsbedingungen</Label>
            <Textarea rows={2} bind:value={paymentTerms} />
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

<ConfirmDialog
  bind:open={blockedConfirmOpen}
  title="Kunde ist gesperrt"
  description={pendingBlockedCustomer
    ? `Dieser Kunde ist als gesperrt markiert.${pendingBlockedCustomer.creditNote ? ` Grund: ${pendingBlockedCustomer.creditNote}` : ""} Trotzdem fortfahren?`
    : ""}
  confirmLabel="Trotzdem fortfahren"
  cancelLabel="Abbrechen"
  destructive
  onConfirm={confirmBlocked}
  onCancel={cancelBlocked}
/>
