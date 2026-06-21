<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    cancelInvoice,
    createCreditNoteFromInvoice,
    deleteInvoice,
    displayInvoiceNumber,
    findCreditNoteFor,
    getInvoice,
    markPaid,
    markSent,
    reopenDraft,
    updateInvoiceInternalMeta,
  } from "$lib/db/invoices";
  import type {
    CustomerSnapshot,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
  } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { generateInvoicePdf, listPdfVersions, type PdfVersion } from "$lib/sidecar/invoice";
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
  import {
    Button,
    Card,
    CardContent,
    Badge,
    ConfirmDialog,
    DatePicker,
    Dialog,
    DropdownMenu,
    DropdownItem,
    DropdownSeparator,
    Input,
    Label,
    Textarea,
    toast,
  } from "$lib/ui";
  import ValidationBadge from "$lib/components/ValidationBadge.svelte";
  import {
    ArrowLeft,
    FileDown,
    FileText,
    FolderOpen,
    Pencil,
    Send,
    CheckCircle2,
    Undo2,
    Ban,
    Trash2,
    MoreHorizontal,
    AlertTriangle,
    Repeat,
    FileWarning,
    ShieldCheck,
    ChevronDown,
    Plus,
    History,
    Clock,
  } from "@lucide/svelte";
  import { execute } from "$lib/db/client";
  import { validatePdf } from "$lib/validator";
  import { listRemindersForInvoice } from "$lib/db/reminders";
  import type { InvoicePayment, Reminder, ReminderLevel } from "$lib/db/schema";
  import { addPayment, deletePayment, listPayments } from "$lib/db/invoice-payments";
  import { eurStringToCents } from "$lib/utils/money";
  import { computeSkonto } from "$lib/utils/skonto";
  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let invoice = $state<Invoice | null>(null);
  let items = $state<InvoiceItem[]>([]);
  let originalInvoice = $state<Invoice | null>(null);
  let cancelledByCreditNote = $state<Invoice | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let generating = $state(false);
  let lastPdfPath = $state<string | null>(null);
  let pdfVersions = $state<PdfVersion[]>([]);
  let pdfError = $state<string | null>(null);

  async function refreshPdfVersions() {
    if (!lastPdfPath) {
      pdfVersions = [];
      return;
    }
    try {
      pdfVersions = await listPdfVersions(lastPdfPath);
    } catch {
      pdfVersions = [];
    }
  }

  function formatVersionTime(unix: number): string {
    return new Date(unix * 1000).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
  let confirmDeleteOpen = $state(false);
  let confirmCreditNoteOpen = $state(false);
  let creatingCreditNote = $state(false);
  let revalidating = $state(false);
  let sendDialogOpen = $state(false);
  let paidDialogOpen = $state(false);
  let dialogDate = $state(toIsoDate(nowUnix()));
  let dialogWarning = $state<string | null>(null);

  function openSendDialog() {
    dialogDate = toIsoDate(nowUnix());
    dialogWarning = null;
    sendDialogOpen = true;
  }

  function openPaidDialog() {
    dialogDate = toIsoDate(nowUnix());
    dialogWarning = null;
    paidDialogOpen = true;
  }

  $effect(() => {
    if (!invoice || !dialogDate) return;
    if (sendDialogOpen) validateSendDate(dialogDate);
    else if (paidDialogOpen) validatePaidDate(dialogDate);
  });

  function validateSendDate(iso: string) {
    if (!invoice) return;
    const ts = fromIsoDate(iso);
    if (ts < invoice.issueDate) {
      dialogWarning = "Versanddatum liegt vor dem Rechnungsdatum.";
    } else if (ts > nowUnix() + 86400) {
      dialogWarning = "Versanddatum liegt in der Zukunft.";
    } else {
      dialogWarning = null;
    }
  }

  function validatePaidDate(iso: string) {
    if (!invoice) return;
    const ts = fromIsoDate(iso);
    const sentRef = invoice.sentAt ?? invoice.issueDate;
    if (ts < sentRef) {
      dialogWarning = "Zahldatum liegt vor dem Versand-/Rechnungsdatum.";
    } else if (ts > nowUnix() + 86400) {
      dialogWarning = "Zahldatum liegt in der Zukunft.";
    } else {
      dialogWarning = null;
    }
  }

  async function confirmSend() {
    if (!invoice) return;
    const ts = fromIsoDate(dialogDate);
    sendDialogOpen = false;
    await action("Als versendet markiert", () => markSent(invoice!.id, ts).then(() => undefined));
  }

  async function confirmPaid() {
    if (!invoice) return;
    const ts = fromIsoDate(dialogDate);
    paidDialogOpen = false;
    await action("Als bezahlt markiert", () => markPaid(invoice!.id, ts));
  }

  const customer = $derived.by(() => {
    if (!invoice) return null;
    try {
      return JSON.parse(invoice.customerSnapshot) as CustomerSnapshot;
    } catch {
      return null;
    }
  });

  async function load() {
    if (!params?.id) return;
    const numId = Number.parseInt(params.id, 10);
    if (Number.isNaN(numId)) return;
    loading = true;
    try {
      const res = await getInvoice(numId);
      if (!res) {
        error = "Rechnung nicht gefunden.";
        return;
      }
      invoice = res.invoice;
      items = res.items;
      lastPdfPath = res.invoice.pdfPath;
      await refreshPdfVersions();

      const [origRes, cnRes] = await Promise.all([
        res.invoice.correctsInvoiceId
          ? getInvoice(res.invoice.correctsInvoiceId)
          : Promise.resolve(null),
        res.invoice.isCreditNote
          ? Promise.resolve(null)
          : findCreditNoteFor(res.invoice.id),
      ]);
      originalInvoice = origRes?.invoice ?? null;
      cancelledByCreditNote = cnRes;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void params?.id;
    load();
  });

  async function action(label: string, fn: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await fn();
      await load();
      toast.success(label);
    } catch (e) {
      error = String(e);
      toast.error("Aktion fehlgeschlagen", String(e));
    } finally {
      busy = false;
    }
  }

  async function performDelete() {
    if (!invoice) return;
    try {
      await deleteInvoice(invoice.id);
      toast.success("Rechnung gelöscht");
      push("/invoices");
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }

  async function performCreateCreditNote() {
    if (!invoice) return;
    creatingCreditNote = true;
    try {
      const newId = await createCreditNoteFromInvoice(invoice.id);
      const res = await getInvoice(newId);
      const newNumber = res?.invoice.number ?? `#${newId}`;
      toast.success(`Stornorechnung ${newNumber} als Entwurf erstellt`);
      push(`/invoices/${newId}/edit`);
    } catch (e) {
      toast.error("Stornorechnung fehlgeschlagen", String(e));
    } finally {
      creatingCreditNote = false;
    }
  }

  async function onRevalidate() {
    if (!invoice || !lastPdfPath || revalidating) return;
    revalidating = true;
    try {
      const report = await validatePdf(lastPdfPath);
      await execute(
        "UPDATE invoices SET last_validation_status = ?, last_validated_at = unixepoch(), last_validation_findings_count = ? WHERE id = ?",
        [report.valid ? "valid" : "invalid", report.findings.length, invoice.id],
      );
      await load();
      if (report.valid) {
        toast.success("Validierung bestanden", `Szenario: ${report.scenario ?? "—"}`);
      } else {
        toast.warning(
          `${report.findings.length} Findings`,
          report.findings[0]?.message ?? "Details unter /validate",
        );
      }
    } catch (e) {
      toast.error("Validierung fehlgeschlagen", String(e));
    } finally {
      revalidating = false;
    }
  }

  async function onGeneratePdf() {
    if (!invoice) return;
    generating = true;
    pdfError = null;
    try {
      const res = await generateInvoicePdf(invoice.id);
      if (res.success) {
        lastPdfPath = res.pdfPath;
        await load(); // refresh validation badge
        const pdfPath = res.pdfPath;
        if (res.kositReport && !res.kositReport.valid) {
          toast.action(
            `PDF erstellt · ${res.kositReport.findings.length} KoSIT-Findings`,
            { label: "Öffnen", onClick: () => openPath(pdfPath) },
            { description: "Versand erst nach Korrektur empfohlen." },
          );
        } else if (res.kositReport?.valid) {
          toast.action(
            "PDF erstellt · ZUGFeRD-konform",
            { label: "Öffnen", onClick: () => openPath(pdfPath) },
          );
        } else {
          toast.action(
            "PDF erstellt",
            { label: "Öffnen", onClick: () => openPath(pdfPath) },
          );
        }
      } else {
        pdfError = `${res.error.code}: ${res.error.message}`;
        toast.error("PDF-Generierung fehlgeschlagen", res.error.message);
      }
    } catch (e) {
      pdfError = String(e);
      toast.error("PDF-Generierung fehlgeschlagen", String(e));
    } finally {
      generating = false;
    }
  }

  async function onOpenExisting() {
    if (lastPdfPath) {
      try {
        await openPath(lastPdfPath);
      } catch (e) {
        pdfError = String(e);
      }
    }
  }

  async function onRevealInExplorer() {
    if (lastPdfPath) {
      try {
        await revealItemInDir(lastPdfPath);
      } catch (e) {
        pdfError = String(e);
      }
    }
  }

  const statusLabel: Record<InvoiceStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    partial: "Teilbezahlt",
    paid: "Bezahlt",
    cancelled: "Storniert",
  };

  const statusVariant: Record<InvoiceStatus, "secondary" | "warning" | "success" | "outline"> = {
    draft: "secondary",
    sent: "warning",
    partial: "warning",
    paid: "success",
    cancelled: "outline",
  };

  const canCreateCreditNote = $derived(
    !!invoice &&
      !invoice.isCreditNote &&
      (invoice.status === "sent" || invoice.status === "paid") &&
      !cancelledByCreditNote,
  );

  let payments = $state<InvoicePayment[]>([]);
  let addPaymentDialogOpen = $state(false);
  let addPaymentDate = $state(toIsoDate(nowUnix()));
  let addPaymentAmountText = $state("");
  let addPaymentNotes = $state("");
  let addPaymentBusy = $state(false);

  $effect(() => {
    if (invoice) {
      listPayments(invoice.id).then((p) => (payments = p)).catch(() => (payments = []));
    } else {
      payments = [];
    }
  });

  const totalAbs = $derived(invoice ? Math.abs(invoice.total) : 0);
  const paidSum = $derived(invoice?.amountPaidCent ?? 0);
  const remainingCent = $derived(Math.max(0, totalAbs - paidSum));

  function openAddPayment() {
    if (!invoice) return;
    addPaymentDate = toIsoDate(nowUnix());
    addPaymentAmountText = (remainingCent / 100).toFixed(2).replace(".", ",");
    addPaymentNotes = "";
    addPaymentDialogOpen = true;
  }

  async function confirmAddPayment() {
    if (!invoice || addPaymentBusy) return;
    const amountCent = eurStringToCents(addPaymentAmountText);
    if (amountCent <= 0) {
      toast.error("Betrag ungültig", "Bitte einen positiven Betrag eintragen.");
      return;
    }
    addPaymentBusy = true;
    try {
      await addPayment({
        invoiceId: invoice.id,
        paidAt: fromIsoDate(addPaymentDate),
        amountCent,
        source: "manual",
        notes: addPaymentNotes.trim() || null,
      });
      addPaymentDialogOpen = false;
      await load();
      toast.success("Zahlung erfasst");
    } catch (e) {
      toast.error("Erfassen fehlgeschlagen", String(e));
    } finally {
      addPaymentBusy = false;
    }
  }

  async function removePayment(p: InvoicePayment) {
    try {
      await deletePayment(p.id);
      await load();
      toast.success("Zahlung entfernt");
    } catch (e) {
      toast.error("Entfernen fehlgeschlagen", String(e));
    }
  }

  let existingReminderLevels = $state<ReminderLevel[]>([]);
  let existingReminders = $state<Reminder[]>([]);
  $effect(() => {
    if (invoice && !invoice.isCreditNote) {
      listRemindersForInvoice(invoice.id)
        .then((list) => {
          existingReminders = list;
          existingReminderLevels = list
            .map((r) => r.level)
            .filter((l): l is ReminderLevel => l === 1 || l === 2 || l === 3);
        })
        .catch(() => {
          existingReminders = [];
          existingReminderLevels = [];
        });
    } else {
      existingReminders = [];
      existingReminderLevels = [];
    }
  });

  const reminderLabels: Record<ReminderLevel, string> = {
    1: "Zahlungserinnerung",
    2: "Mahnung",
    3: "Letzte Mahnung",
  };

  const skontoInfo = $derived.by(() => {
    if (!invoice) return null;
    return computeSkonto({
      totalCent: Math.abs(invoice.total),
      percent: invoice.skontoPercent,
      days: invoice.skontoDays,
      issueDate: invoice.issueDate,
      isCreditNote: invoice.isCreditNote,
    });
  });

  const skontoStillValid = $derived(
    !!skontoInfo &&
      !!invoice &&
      invoice.status === "sent" &&
      skontoInfo.deadlineUnix * 1000 >= Date.now(),
  );

  let notesInternalDraft = $state("");
  let followUpIso = $state("");
  let savingMeta = $state(false);
  $effect(() => {
    if (invoice) {
      notesInternalDraft = invoice.notesInternal ?? "";
      followUpIso = invoice.followUpDate ? toIsoDate(invoice.followUpDate) : "";
    }
  });
  const metaDirty = $derived(
    !!invoice &&
      ((invoice.notesInternal ?? "") !== notesInternalDraft ||
        (invoice.followUpDate ? toIsoDate(invoice.followUpDate) : "") !== followUpIso),
  );

  async function saveMeta() {
    if (!invoice || savingMeta) return;
    savingMeta = true;
    try {
      await updateInvoiceInternalMeta(invoice.id, {
        notesInternal: notesInternalDraft.trim() === "" ? null : notesInternalDraft,
        followUpDate: followUpIso ? fromIsoDate(followUpIso) : null,
      });
      toast.success("Interne Notizen gespeichert");
      await load();
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      savingMeta = false;
    }
  }

  const isOverdue = $derived(
    !!invoice &&
      !invoice.isCreditNote &&
      invoice.status === "sent" &&
      invoice.dueDate * 1000 < Date.now(),
  );

  const nextReminderLevel = $derived<ReminderLevel>(
    existingReminderLevels.includes(2)
      ? 3
      : existingReminderLevels.includes(1)
        ? 2
        : 1,
  );

  const canCreateReminder = $derived(
    isOverdue && !existingReminderLevels.includes(3),
  );

</script>

<header class="mb-6">
  <a
    href="/invoices"
    use:link
    class="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" /> Rechnungen
  </a>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error && !invoice}
  <p class="text-sm text-destructive">{error}</p>
{:else if invoice && customer}
  {#if invoice.isCreditNote}
    <Card class="border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5 mb-4">
      <CardContent>
        <div class="flex items-start gap-3">
          <AlertTriangle class="size-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div class="flex-1 text-sm">
            <div class="font-medium text-amber-700 dark:text-amber-400">Stornorechnung</div>
            <div class="mt-0.5 text-muted-foreground">
              Storniert die Rechnung
              {#if originalInvoice}
                <a
                  href={`/invoices/${originalInvoice.id}`}
                  use:link
                  class="font-mono font-medium text-foreground hover:underline"
                >{originalInvoice.number}</a>
                vom {formatDate(originalInvoice.issueDate)}
              {:else if invoice.correctsInvoiceId}
                <span class="font-mono">#{invoice.correctsInvoiceId}</span>
              {/if}.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

  {#if cancelledByCreditNote}
    <Card class="border-amber-500/40 bg-amber-500/10 dark:bg-amber-500/5 mb-4">
      <CardContent>
        <div class="flex items-start gap-3">
          <AlertTriangle class="size-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div class="flex-1 text-sm">
            <div class="font-medium text-amber-700 dark:text-amber-400">Storniert</div>
            <div class="mt-0.5 text-muted-foreground">
              Wurde storniert durch
              <a
                href={`/invoices/${cancelledByCreditNote.id}`}
                use:link
                class="font-mono font-medium text-foreground hover:underline"
              >{cancelledByCreditNote.number}</a>.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

  <div class="flex items-start justify-between gap-4 mb-6">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-semibold tracking-tight font-mono">
          {invoice.isCreditNote ? "Storno " : ""}{displayInvoiceNumber(invoice)}
        </h1>
        {#if invoice.status !== "draft" || invoice.isCreditNote}
          <Badge variant={invoice.isCreditNote ? "destructive" : statusVariant[invoice.status]}>
            {invoice.isCreditNote ? `Storno · ${statusLabel[invoice.status]}` : statusLabel[invoice.status]}
          </Badge>
        {/if}
        {#if invoice.lastValidationStatus || lastPdfPath}
          <ValidationBadge
            status={invoice.lastValidationStatus}
            findingsCount={invoice.lastValidationFindingsCount}
          />
        {/if}
      </div>
      <p class="text-sm text-muted-foreground mt-1.5">
        {customer.name} · {formatDate(invoice.issueDate)}
        {#if invoice.lastValidatedAt}
          · validiert {new Date(invoice.lastValidatedAt * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        {/if}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button disabled={generating} onclick={onGeneratePdf}>
        <FileDown />
        {generating ? "Erzeuge…" : lastPdfPath ? "PDF neu erzeugen" : "PDF erzeugen"}
      </Button>

      {#if lastPdfPath}
        {#snippet openSecondaryTrigger()}
          <button
            type="button"
            class="inline-flex items-center justify-center w-7 h-9 rounded-l-none rounded-r-md border border-l-0 border-input bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 transition-colors cursor-pointer shadow-xs"
            aria-label="Weitere Dokument-Aktionen"
          >
            <ChevronDown class="size-4" />
          </button>
        {/snippet}
        <div class="inline-flex">
          <Button
            variant="outline"
            onclick={onOpenExisting}
            class="rounded-r-none"
          >
            <FileText />
            Öffnen
          </Button>
          <DropdownMenu trigger={openSecondaryTrigger}>
            <DropdownItem onSelect={onRevalidate} disabled={revalidating}>
              <ShieldCheck /> {revalidating ? "Prüfe…" : "Validieren"}
            </DropdownItem>
            <DropdownItem onSelect={onRevealInExplorer}>
              <FolderOpen /> Im Explorer zeigen
            </DropdownItem>
          </DropdownMenu>
        </div>
      {/if}

      {#if invoice.status === "draft"}
        <Button disabled={busy} onclick={openSendDialog}>
          <Send />
          Versenden
        </Button>
      {:else if invoice.status === "sent"}
        <Button disabled={busy} onclick={openPaidDialog}>
          <CheckCircle2 />
          Bezahlt
        </Button>
      {/if}

      <DropdownMenu>
        {#snippet trigger()}
          <button
            type="button"
            class="inline-flex items-center justify-center size-9 rounded-md border border-border hover:bg-accent transition-colors cursor-pointer"
            aria-label="Weitere Aktionen"
          >
            <MoreHorizontal class="size-4" />
          </button>
        {/snippet}

        {#if invoice.status === "draft"}
          <DropdownItem onSelect={() => push(`/invoices/${invoice!.id}/edit`)}>
            <Pencil /> Bearbeiten
          </DropdownItem>
        {/if}
        {#if canCreateReminder}
          <DropdownItem onSelect={() => push(`/reminders/new/${invoice!.id}/${nextReminderLevel}`)}>
            <FileWarning />
            {nextReminderLevel === 1
              ? "Erinnerung erstellen"
              : nextReminderLevel === 2
                ? "Mahnung erstellen"
                : "Letzte Mahnung erstellen"}
          </DropdownItem>
        {/if}
        {#if canCreateCreditNote}
          <DropdownItem
            disabled={creatingCreditNote}
            onSelect={() => (confirmCreditNoteOpen = true)}
          >
            <Ban /> Stornorechnung erstellen
          </DropdownItem>
        {/if}
        {#if !invoice.isCreditNote}
          <DropdownItem onSelect={() => push(`/recurring/new?fromInvoice=${invoice!.id}`)}>
            <Repeat /> Als Vorlage speichern
          </DropdownItem>
        {/if}
        {#if invoice.status === "sent"}
          <DropdownSeparator />
          <DropdownItem onSelect={() => action("Zurück zu Entwurf", () => reopenDraft(invoice!.id))}>
            <Undo2 /> Zurück zu Entwurf
          </DropdownItem>
        {/if}
        {#if invoice.status !== "cancelled" && invoice.status !== "paid"}
          <DropdownItem onSelect={() => action("Storniert", () => cancelInvoice(invoice!.id))}>
            <Ban /> Stornieren
          </DropdownItem>
        {/if}
        {#if invoice.status === "draft" || invoice.status === "cancelled"}
          <DropdownSeparator />
          <DropdownItem destructive onSelect={() => (confirmDeleteOpen = true)}>
            <Trash2 /> Löschen
          </DropdownItem>
        {/if}
      </DropdownMenu>
    </div>
  </div>

  {#if pdfError}
    <Card class="border-destructive/40 bg-destructive/5 mb-4">
      <CardContent>
        <div class="flex items-start gap-3">
          <AlertTriangle class="size-5 text-destructive shrink-0 mt-0.5" />
          <div class="flex-1 text-sm">
            <div class="font-medium text-destructive">PDF-Generierung fehlgeschlagen</div>
            <div class="mt-1 font-mono text-xs text-muted-foreground whitespace-pre-wrap">{pdfError}</div>
            <div class="mt-2 text-xs text-muted-foreground">
              Sidecar-Setup geprüft? Siehe sidecar/README.md (Python 3.12 + GTK + venv).
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}
  {#if lastPdfPath && !pdfError}
    {#if pdfVersions.length > 0}
      <Card class="mb-4">
        <CardContent class="py-3">
          <div class="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History class="size-4" />
            PDF-Versionen
            {#if pdfVersions.length > 1}
              <Badge variant="secondary" class="normal-case">{pdfVersions.length}</Badge>
            {/if}
          </div>
          <ul class="divide-y divide-border/60 text-sm">
            {#each pdfVersions as v (v.path)}
              <li class="flex items-center justify-between gap-3 py-1.5">
                <div class="flex items-center gap-2 min-w-0">
                  <Clock class="size-3.5 text-muted-foreground shrink-0" />
                  <span class="tabular-nums">{formatVersionTime(v.modifiedUnix)}</span>
                  {#if v.current}
                    <Badge variant="outline">Aktuell</Badge>
                  {/if}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onclick={() => openPath(v.path)}>
                    <FileText class="size-4" /> Öffnen
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => revealItemInDir(v.path)}
                    title="Im Ordner zeigen"
                  >
                    <FolderOpen class="size-4" />
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        </CardContent>
      </Card>
    {:else}
      <p class="text-xs text-muted-foreground mb-4 font-mono">PDF: {lastPdfPath}</p>
    {/if}
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <Card>
      <CardContent>
        <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
          Kunde (Snapshot)
        </h2>
        <div class="text-sm space-y-0.5">
          <div class="font-medium">{customer.name}</div>
          {#if customer.contactPerson}<div>{customer.contactPerson}</div>{/if}
          <div class="text-muted-foreground">{customer.street}</div>
          <div class="text-muted-foreground">{customer.postalCode} {customer.city}</div>
          <div class="text-muted-foreground">{customer.country}</div>
          {#if customer.vatId}
            <div class="text-xs mt-2 text-muted-foreground">USt-IdNr.: {customer.vatId}</div>
          {/if}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent>
        <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
          Eckdaten
        </h2>
        <dl class="text-sm grid grid-cols-2 gap-y-1.5">
          <dt class="text-muted-foreground">{invoice.isCreditNote ? "Stornodatum" : "Rechnungsdatum"}</dt>
          <dd>{formatDate(invoice.issueDate)}</dd>
          {#if !invoice.isCreditNote}
            <dt class="text-muted-foreground">Fällig am</dt>
            <dd>{formatDate(invoice.dueDate)}</dd>
          {/if}
          {#if invoice.servicePeriodStart && invoice.servicePeriodEnd}
            <dt class="text-muted-foreground">Leistungszeitraum</dt>
            <dd>{formatDate(invoice.servicePeriodStart)} – {formatDate(invoice.servicePeriodEnd)}</dd>
          {:else if invoice.deliveryDate}
            <dt class="text-muted-foreground">Leistungsdatum</dt>
            <dd>{formatDate(invoice.deliveryDate)}</dd>
          {/if}
          {#if invoice.sentAt}
            <dt class="text-muted-foreground">Versendet</dt>
            <dd>{formatDate(invoice.sentAt)}</dd>
          {/if}
          {#if invoice.paidAt}
            <dt class="text-muted-foreground">Bezahlt</dt>
            <dd>{formatDate(invoice.paidAt)}</dd>
          {/if}
          {#if invoice.currency && invoice.currency !== "EUR"}
            <dt class="text-muted-foreground">Währung</dt>
            <dd>
              <Badge variant="outline">{invoice.currency}</Badge>
            </dd>
            {#if invoice.exchangeRate}
              <dt class="text-muted-foreground">Wechselkurs</dt>
              <dd class="font-mono">1 EUR = {invoice.exchangeRate} {invoice.currency}</dd>
            {/if}
            {#if invoice.eurTotalCent !== null && invoice.eurTotalCent !== undefined}
              <dt class="text-muted-foreground">Gesamt (EUR)</dt>
              <dd class="font-mono">{centsToEur(invoice.eurTotalCent)}</dd>
            {/if}
          {/if}
        </dl>
      </CardContent>
    </Card>
  </div>

  <Card class="overflow-hidden mb-6">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium w-12">#</th>
          <th class="px-4 py-3 font-medium">Beschreibung</th>
          <th class="px-4 py-3 font-medium text-right w-20">Menge</th>
          <th class="px-4 py-3 font-medium w-20">Einheit</th>
          <th class="px-4 py-3 font-medium text-right w-28">Preis</th>
          {#if !invoice.isKleinunternehmer}
            <th class="px-4 py-3 font-medium text-right w-16">USt%</th>
          {/if}
          <th class="px-4 py-3 font-medium text-right w-28">Summe</th>
        </tr>
      </thead>
      <tbody>
        {#each items as it (it.id)}
          <tr class="border-t border-border">
            <td class="px-4 py-3 text-xs text-muted-foreground align-top">{it.position}</td>
            <td class="px-4 py-3 align-top">
              <div>{it.description}</div>
              {#if it.longDescription}
                <div class="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">{it.longDescription}</div>
              {/if}
              {#if it.linePeriodStart && it.linePeriodEnd}
                <div class="mt-0.5 text-xs text-muted-foreground italic">
                  {#if it.linePeriodStart === it.linePeriodEnd}
                    Leistungsdatum {formatDate(it.linePeriodStart)}
                  {:else}
                    Leistungszeitraum {formatDate(it.linePeriodStart)} – {formatDate(it.linePeriodEnd)}
                  {/if}
                </div>
              {/if}
            </td>
            <td class="px-4 py-3 text-right align-top">{it.quantity}</td>
            <td class="px-4 py-3">{it.unit}</td>
            <td class="px-4 py-3 text-right font-mono">{formatMoney(it.unitPrice, invoice.currency)}</td>
            {#if !invoice.isKleinunternehmer}
              <td class="px-4 py-3 text-right">{it.vatRate}</td>
            {/if}
            <td class="px-4 py-3 text-right font-mono">{formatMoney(it.lineTotal, invoice.currency)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="bg-muted/40">
        <tr class="border-t border-border">
          <td colspan={invoice.isKleinunternehmer ? 5 : 6} class="px-4 py-2 text-right text-muted-foreground">
            Zwischensumme
          </td>
          <td class="px-4 py-2 text-right font-mono">{formatMoney(invoice.subtotal, invoice.currency)}</td>
        </tr>
        {#if !invoice.isKleinunternehmer}
          <tr>
            <td colspan="6" class="px-4 py-2 text-right text-muted-foreground">USt</td>
            <td class="px-4 py-2 text-right font-mono">{formatMoney(invoice.vatAmount, invoice.currency)}</td>
          </tr>
        {/if}
        <tr class="border-t border-border">
          <td colspan={invoice.isKleinunternehmer ? 5 : 6} class="px-4 py-3 text-right font-semibold">
            Gesamtbetrag
          </td>
          <td class="px-4 py-3 text-right font-mono font-semibold">{formatMoney(invoice.total, invoice.currency)}</td>
        </tr>
      </tfoot>
    </table>
  </Card>

  {#if invoice.paymentTerms && !invoice.isCreditNote}
    <section class="mb-4">
      <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">
        Zahlungsbedingungen
      </h3>
      <p class="text-sm whitespace-pre-line">{invoice.paymentTerms}</p>
    </section>
  {/if}

  {#if invoice.notes}
    <section class="mb-4">
      <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">
        Notizen (auf der Rechnung)
      </h3>
      <p class="text-sm whitespace-pre-line">{invoice.notes}</p>
    </section>
  {/if}

  {#if invoice.status === "sent" || invoice.status === "partial" || invoice.status === "paid"}
    {#if payments.length > 0 || invoice.status === "partial"}
      <Card class="mb-6">
        <CardContent>
          <div class="flex items-center justify-between gap-3 mb-3">
            <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Zahlungen
            </h3>
            {#if invoice.status !== "paid" && !invoice.isCreditNote}
              <Button size="sm" variant="outline" onclick={openAddPayment}>
                <Plus class="size-3.5" />
                Zahlung erfassen
              </Button>
            {/if}
          </div>

          <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
            <div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
              <div class="font-medium tabular-nums">{formatMoney(totalAbs, invoice.currency)}</div>
            </div>
            <div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Bezahlt</div>
              <div class="font-medium tabular-nums text-green-600 dark:text-green-500">{formatMoney(paidSum, invoice.currency)}</div>
            </div>
            <div>
              <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Offen</div>
              <div class="font-medium tabular-nums {remainingCent > 0 ? 'text-amber-600 dark:text-amber-500' : ''}">{formatMoney(remainingCent, invoice.currency)}</div>
            </div>
          </div>

          {#if payments.length > 0}
            <div class="border-t pt-3 space-y-2">
              {#each payments as p (p.id)}
                <div class="flex items-center justify-between gap-3 text-sm">
                  <div class="flex items-center gap-3">
                    <span class="text-muted-foreground tabular-nums text-xs">{formatDate(p.paidAt)}</span>
                    <span class="tabular-nums font-medium">{formatMoney(p.amountCent, invoice.currency)}</span>
                    {#if p.source !== "manual"}
                      <Badge variant="secondary" class="text-[10px]">{p.source}</Badge>
                    {/if}
                    {#if p.notes}
                      <span class="text-xs text-muted-foreground truncate">{p.notes}</span>
                    {/if}
                  </div>
                  {#if invoice.status !== "paid" || payments.length > 1}
                    <button
                      type="button"
                      onclick={() => removePayment(p)}
                      class="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Zahlung entfernen"
                    >
                      <Trash2 class="size-3.5" />
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </CardContent>
      </Card>
    {/if}
  {/if}

  {#if skontoInfo}
    <Card class="mb-6 border-primary/30">
      <CardContent class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
            Skonto
          </h3>
          <p class="text-sm mt-1">
            {skontoInfo.percent} % bei Zahlung bis
            <strong>{formatDate(skontoInfo.deadlineUnix)}</strong>
            — Rabatt
            <strong>{formatMoney(skontoInfo.discountCent, invoice.currency)}</strong>
          </p>
        </div>
        <Badge variant={skontoStillValid ? "success" : "outline"} class="shrink-0">
          {skontoStillValid ? "noch gültig" : invoice.status === "paid" ? "Rechnung bezahlt" : "abgelaufen"}
        </Badge>
      </CardContent>
    </Card>
  {/if}

  {#if existingReminders.length > 0}
    <Card class="mb-6">
      <CardContent>
        <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">
          Mahnstufen
        </h3>
        <div class="flex flex-wrap gap-2">
          {#each existingReminders as r (r.id)}
            <a
              href={`/reminders/${r.id}`}
              use:link
              class="group inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-accent/60 transition-colors"
            >
              <span class="inline-flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums">
                M{r.level}
              </span>
              <span class="font-medium">{reminderLabels[r.level as ReminderLevel] ?? `Stufe ${r.level}`}</span>
              <span class="text-xs text-muted-foreground">{formatDate(r.issueDate)}</span>
              <Badge variant={r.status === "sent" ? "warning" : "secondary"} class="text-[10px]">
                {r.status === "sent" ? "versandt" : "Entwurf"}
              </Badge>
            </a>
          {/each}
          {#if canCreateReminder}
            <button
              type="button"
              onclick={() => push(`/reminders/new/${invoice!.id}/${nextReminderLevel}`)}
              class="group inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <FileWarning class="size-3.5" />
              <span>
                Nächste Stufe: {reminderLabels[nextReminderLevel]}
              </span>
            </button>
          {/if}
        </div>
      </CardContent>
    </Card>
  {/if}

  <Card class="mb-6">
    <CardContent class="space-y-4">
      <div>
        <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
          Interne Notizen & Wiedervorlage
        </h3>
        <p class="text-xs text-muted-foreground mt-0.5">
          Nur intern, erscheint nicht auf der Rechnung.
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="notes-internal">Notizen (intern)</Label>
        <Textarea
          id="notes-internal"
          rows={3}
          bind:value={notesInternalDraft}
          placeholder="z. B. Telefonat am … abgesprochen, Skonto gewährt, etc."
        />
      </div>
      <div class="flex flex-col gap-1.5 max-w-xs">
        <Label for="follow-up">Wiedervorlage am</Label>
        <DatePicker id="follow-up" bind:value={followUpIso} />
      </div>
      <div class="flex items-center gap-2">
        <Button onclick={saveMeta} disabled={!metaDirty || savingMeta}>
          {savingMeta ? "Speichere…" : "Speichern"}
        </Button>
        {#if metaDirty && !savingMeta}
          <span class="text-xs text-muted-foreground">Ungespeicherte Änderungen.</span>
        {/if}
      </div>
    </CardContent>
  </Card>

  <ConfirmDialog
    bind:open={confirmDeleteOpen}
    title="Rechnung löschen?"
    description={invoice ? `${displayInvoiceNumber(invoice)} wird unwiderruflich entfernt.` : ""}
    confirmLabel="Löschen"
    destructive
    onConfirm={performDelete}
  />

  <ConfirmDialog
    bind:open={confirmCreditNoteOpen}
    title="Stornorechnung erstellen?"
    description={invoice
      ? `Erstellt einen Entwurf, der ${displayInvoiceNumber(invoice)} vollständig storniert. Mengen lassen sich anschließend für Teilstornos anpassen.`
      : ""}
    confirmLabel="Erstellen"
    destructive
    onConfirm={performCreateCreditNote}
  />

  <Dialog bind:open={sendDialogOpen} title="Als versendet markieren" description="Festschreiben unter neuer Rechnungsnummer.">
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <Label for="send-date">Versanddatum</Label>
        <DatePicker
          id="send-date"
          bind:value={dialogDate}
        />
        <p class="text-xs text-muted-foreground">Standard ist heute. Für Nacherfassung das tatsächliche Versanddatum eintragen.</p>
        {#if dialogWarning}
          <p class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle class="size-3.5" /> {dialogWarning}
          </p>
        {/if}
      </div>
    </div>
    {#snippet footer()}
      <Button variant="outline" onclick={() => (sendDialogOpen = false)}>Abbrechen</Button>
      <Button onclick={confirmSend} disabled={!dialogDate}>Versenden</Button>
    {/snippet}
  </Dialog>

  <Dialog bind:open={addPaymentDialogOpen} title="Zahlung erfassen" description="Wird als invoice_payments-Eintrag protokolliert. Voller Saldo → Rechnung wird automatisch als bezahlt markiert.">
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <Label for="pay-date">Zahldatum</Label>
        <DatePicker id="pay-date" bind:value={addPaymentDate} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="pay-amount">Betrag ({invoice?.currency ?? "EUR"})</Label>
        <Input id="pay-amount" type="text" inputmode="decimal" bind:value={addPaymentAmountText} />
        <p class="text-xs text-muted-foreground">
          Offen: <strong>{formatMoney(remainingCent, invoice?.currency ?? "EUR")}</strong>
        </p>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="pay-notes">Notiz (optional)</Label>
        <Input id="pay-notes" bind:value={addPaymentNotes} placeholder="z. B. Banküberweisung von Customer X" />
      </div>
    </div>
    {#snippet footer()}
      <Button variant="outline" onclick={() => (addPaymentDialogOpen = false)} disabled={addPaymentBusy}>Abbrechen</Button>
      <Button onclick={confirmAddPayment} disabled={addPaymentBusy}>
        {addPaymentBusy ? "Erfasse…" : "Erfassen"}
      </Button>
    {/snippet}
  </Dialog>

  <Dialog bind:open={paidDialogOpen} title="Als bezahlt markieren" description="Zahldatum für Statistik und DATEV-Export.">
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <Label for="paid-date">Zahldatum</Label>
        <DatePicker
          id="paid-date"
          bind:value={dialogDate}
        />
        <p class="text-xs text-muted-foreground">Standard ist heute. Bei Nacherfassung das echte Zahldatum eintragen — Dashboard und Monats-Charts hängen davon ab.</p>
        {#if dialogWarning}
          <p class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle class="size-3.5" /> {dialogWarning}
          </p>
        {/if}
      </div>
    </div>
    {#snippet footer()}
      <Button variant="outline" onclick={() => (paidDialogOpen = false)}>Abbrechen</Button>
      <Button onclick={confirmPaid} disabled={!dialogDate}>Bestätigen</Button>
    {/snippet}
  </Dialog>
{/if}
