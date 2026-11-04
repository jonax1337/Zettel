<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
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
  } from "$lib/db/invoices";
  import { listPayments } from "$lib/db/invoice-payments";
  import { listRemindersForInvoice } from "$lib/db/reminders";
  import type { Invoice, InvoiceItem, InvoicePayment, Reminder } from "$lib/db/schema";
  import { formatDate, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { generateInvoicePdf, listPdfVersions, type PdfVersion } from "$lib/sidecar/invoice";
  import { validatePdf, type ValidationReport } from "$lib/validator";
  import { Badge, Button, ConfirmDialog, toast } from "$lib/ui";
  import ValidationBadge from "$lib/components/ValidationBadge.svelte";
  import { CheckCircle2, Send } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { parseCustomerSnapshot, UNREADABLE_SNAPSHOT_MESSAGE } from "./invoice/customer-snapshot";
  import CustomerSnapshotCard from "./invoice/CustomerSnapshotCard.svelte";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { paidDateWarning, sendDateWarning } from "./invoice/date-warnings";
  import InternalNotesCard from "./invoice/InternalNotesCard.svelte";
  import InvoiceActionsMenu from "./invoice/InvoiceActionsMenu.svelte";
  import InvoiceFactsCard from "./invoice/InvoiceFactsCard.svelte";
  import InvoicePdfActions from "./invoice/InvoicePdfActions.svelte";
  import LineItemsTable from "./invoice/LineItemsTable.svelte";
  import NoticeCard from "./invoice/NoticeCard.svelte";
  import PaymentsCard from "./invoice/PaymentsCard.svelte";
  import PdfErrorNotice from "./invoice/PdfErrorNotice.svelte";
  import PdfVersionList from "./invoice/PdfVersionList.svelte";
  import ReminderLevelsCard from "./invoice/ReminderLevelsCard.svelte";
  import { isReminderLevel, nextReminderLevel } from "./invoice/reminder-levels";
  import { INVALID_ROUTE_ID_MESSAGE, parseRouteId } from "./invoice/route-id";
  import SkontoCard from "./invoice/SkontoCard.svelte";
  import { INVOICE_STATUS_LABEL, INVOICE_STATUS_VARIANT } from "./invoice/status";
  import TextSection from "./invoice/TextSection.svelte";
  import { storeInvoiceValidation } from "./invoice/validation-store";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let invoice = $state<Invoice | null>(null);
  let items = $state<InvoiceItem[]>([]);
  let originalInvoice = $state<Invoice | null>(null);
  let cancelledByCreditNote = $state<Invoice | null>(null);
  let payments = $state<InvoicePayment[]>([]);
  let reminders = $state<Reminder[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);

  let lastPdfPath = $state<string | null>(null);
  let pdfVersions = $state<PdfVersion[]>([]);
  let pdfError = $state<string | null>(null);
  let generating = $state(false);
  let revalidating = $state(false);
  // Invoices validated by an older build carry a stale 'unavailable' status; each is re-checked once.
  let autoRevalidatedId: number | null = null;

  let confirmDeleteOpen = $state(false);
  let confirmCreditNoteOpen = $state(false);
  let creatingCreditNote = $state(false);
  let sendDialogOpen = $state(false);
  let paidDialogOpen = $state(false);
  let dialogDate = $state(toIsoDate(nowUnix()));

  const customer = $derived(invoice ? parseCustomerSnapshot(invoice.customerSnapshot) : null);

  const dialogWarning = $derived.by(() => {
    if (!invoice || !dialogDate) return null;
    const ts = fromIsoDate(dialogDate);
    if (sendDialogOpen) return sendDateWarning(ts, invoice.issueDate, nowUnix());
    if (paidDialogOpen) return paidDateWarning(ts, invoice, nowUnix());
    return null;
  });

  const showPayments = $derived(
    !!invoice &&
      (invoice.status === "sent" || invoice.status === "partial" || invoice.status === "paid") &&
      (payments.length > 0 || invoice.status === "partial"),
  );

  const canCreateCreditNote = $derived(
    !!invoice &&
      !invoice.isCreditNote &&
      (invoice.status === "sent" || invoice.status === "paid") &&
      !cancelledByCreditNote,
  );

  const isOverdue = $derived(
    !!invoice &&
      !invoice.isCreditNote &&
      invoice.status === "sent" &&
      invoice.dueDate < nowUnix(),
  );
  const existingReminderLevels = $derived(reminders.map((r) => r.level).filter(isReminderLevel));
  const creatableReminderLevel = $derived(
    isOverdue && !existingReminderLevels.includes(3) ? nextReminderLevel(existingReminderLevels) : null,
  );

  $effect(() => {
    void params?.id;
    load();
  });

  async function load() {
    const invoiceId = parseRouteId(params?.id);
    if (invoiceId === null) {
      invoice = null;
      error = INVALID_ROUTE_ID_MESSAGE;
      loading = false;
      return;
    }
    loading = true;
    error = null;
    try {
      const res = await getInvoice(invoiceId);
      if (!res) {
        invoice = null;
        error = "Rechnung nicht gefunden.";
        return;
      }
      invoice = res.invoice;
      items = res.items;
      lastPdfPath = res.invoice.pdfPath;
      await Promise.all([
        refreshPdfVersions(),
        loadRelatedInvoices(res.invoice),
        loadPayments(res.invoice),
        loadReminders(res.invoice),
      ]);
      void maybeAutoRevalidate();
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function loadRelatedInvoices(inv: Invoice) {
    const [original, creditNote] = await Promise.all([
      inv.correctsInvoiceId ? getInvoice(inv.correctsInvoiceId) : null,
      inv.isCreditNote ? null : findCreditNoteFor(inv.id),
    ]);
    originalInvoice = original?.invoice ?? null;
    cancelledByCreditNote = creditNote;
  }

  async function loadPayments(inv: Invoice) {
    try {
      payments = await listPayments(inv.id);
    } catch (e) {
      payments = [];
      toast.error("Zahlungen konnten nicht geladen werden", String(e));
    }
  }

  async function loadReminders(inv: Invoice) {
    if (inv.isCreditNote) {
      reminders = [];
      return;
    }
    try {
      reminders = await listRemindersForInvoice(inv.id);
    } catch (e) {
      reminders = [];
      toast.error("Mahnungen konnten nicht geladen werden", String(e));
    }
  }

  async function refreshPdfVersions() {
    if (!lastPdfPath) {
      pdfVersions = [];
      return;
    }
    try {
      pdfVersions = await listPdfVersions(lastPdfPath);
    } catch (e) {
      pdfVersions = [];
      toast.error("PDF-Versionen konnten nicht geladen werden", String(e));
    }
  }

  async function action(label: string, fn: () => Promise<unknown>) {
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

  function openSendDialog() {
    dialogDate = toIsoDate(nowUnix());
    sendDialogOpen = true;
  }

  function openPaidDialog() {
    dialogDate = toIsoDate(nowUnix());
    paidDialogOpen = true;
  }

  async function confirmSend() {
    if (!invoice) return;
    const { id } = invoice;
    const sentAt = fromIsoDate(dialogDate);
    sendDialogOpen = false;
    await action("Als versendet markiert", () => markSent(id, sentAt));
  }

  async function confirmPaid() {
    if (!invoice) return;
    const { id } = invoice;
    const paidAt = fromIsoDate(dialogDate);
    paidDialogOpen = false;
    await action("Als bezahlt markiert", () => markPaid(id, paidAt));
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
      const created = await getInvoice(newId);
      toast.success(`Stornorechnung ${created?.invoice.number ?? `#${newId}`} als Entwurf erstellt`);
      push(`/invoices/${newId}/edit`);
    } catch (e) {
      toast.error("Stornorechnung fehlgeschlagen", String(e));
    } finally {
      creatingCreditNote = false;
    }
  }

  async function maybeAutoRevalidate() {
    if (!invoice || !lastPdfPath) return;
    if (invoice.lastValidationStatus !== "unavailable") return;
    if (autoRevalidatedId === invoice.id) return;
    autoRevalidatedId = invoice.id;
    try {
      const report = await validatePdf(lastPdfPath);
      const lastValidationStatus = await storeInvoiceValidation(invoice.id, report);
      invoice = { ...invoice, lastValidationStatus };
    } catch {
      // Validator still unavailable or PDF without XML: keep the old status, no noise.
    }
  }

  async function onRevalidate() {
    if (!invoice || !lastPdfPath || revalidating) return;
    revalidating = true;
    try {
      const report = await validatePdf(lastPdfPath);
      await storeInvoiceValidation(invoice.id, report);
      await load();
      announceValidation(report);
    } catch (e) {
      toast.error("Validierung fehlgeschlagen", String(e));
    } finally {
      revalidating = false;
    }
  }

  function announceValidation(report: ValidationReport) {
    if (report.valid) {
      toast.success("Validierung bestanden", `Szenario: ${report.scenario ?? "—"}`);
    } else {
      toast.warning(`${report.findings.length} Findings`, report.findings[0]?.message ?? "Details unter /validate");
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
        await load();
        announcePdfCreated(res.pdfPath, res.kositReport);
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

  function announcePdfCreated(pdfPath: string, report: ValidationReport | null | undefined) {
    const openAction = { label: "Öffnen", onClick: () => openPath(pdfPath) };
    if (report && !report.valid) {
      toast.action(`PDF erstellt · ${report.findings.length} KoSIT-Findings`, openAction, {
        description: "Versand erst nach Korrektur empfohlen.",
      });
    } else {
      toast.action(report?.valid ? "PDF erstellt · ZUGFeRD-konform" : "PDF erstellt", openAction);
    }
  }

  async function usePdfFile(open: (path: string) => Promise<void>) {
    if (!lastPdfPath) return;
    try {
      await open(lastPdfPath);
    } catch (e) {
      pdfError = String(e);
    }
  }
</script>

<header class="mb-6">
  <BackLink href="/invoices">Rechnungen</BackLink>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error && !invoice}
  <p class="text-sm text-destructive">{error}</p>
{:else if invoice && !customer}
  <p class="text-sm text-destructive">{UNREADABLE_SNAPSHOT_MESSAGE}</p>
{:else if invoice && customer}
  {#if invoice.isCreditNote}
    <NoticeCard tone="warning" title="Stornorechnung">
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
    </NoticeCard>
  {/if}

  {#if cancelledByCreditNote}
    <NoticeCard tone="warning" title="Storniert">
      <div class="mt-0.5 text-muted-foreground">
        Wurde storniert durch
        <a
          href={`/invoices/${cancelledByCreditNote.id}`}
          use:link
          class="font-mono font-medium text-foreground hover:underline"
        >{cancelledByCreditNote.number}</a>.
      </div>
    </NoticeCard>
  {/if}

  <div class="flex items-start justify-between gap-4 mb-6">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-semibold tracking-tight font-mono">
          {invoice.isCreditNote ? "Storno " : ""}{displayInvoiceNumber(invoice)}
        </h1>
        {#if invoice.status !== "draft" || invoice.isCreditNote}
          <Badge variant={invoice.isCreditNote ? "destructive" : INVOICE_STATUS_VARIANT[invoice.status]}>
            {invoice.isCreditNote
              ? `Storno · ${INVOICE_STATUS_LABEL[invoice.status]}`
              : INVOICE_STATUS_LABEL[invoice.status]}
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
          · validiert {new Date(invoice.lastValidatedAt * 1000).toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        {/if}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <InvoicePdfActions
        hasPdf={!!lastPdfPath}
        {generating}
        {revalidating}
        onGenerate={onGeneratePdf}
        onOpen={() => usePdfFile(openPath)}
        onReveal={() => usePdfFile(revealItemInDir)}
        {onRevalidate}
      />

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

      <InvoiceActionsMenu
        {invoice}
        {creatableReminderLevel}
        {canCreateCreditNote}
        {creatingCreditNote}
        onReopenDraft={() => action("Zurück zu Entwurf", () => reopenDraft(invoice!.id))}
        onCancelInvoice={() => action("Storniert", () => cancelInvoice(invoice!.id))}
        onRequestCreditNote={() => (confirmCreditNoteOpen = true)}
        onRequestDelete={() => (confirmDeleteOpen = true)}
      />
    </div>
  </div>

  {#if pdfError}
    <PdfErrorNotice message={pdfError} />
  {:else if lastPdfPath}
    {#if pdfVersions.length > 0}
      <PdfVersionList versions={pdfVersions} />
    {:else}
      <p class="text-xs text-muted-foreground mb-4 font-mono">PDF: {lastPdfPath}</p>
    {/if}
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <CustomerSnapshotCard {customer} />
    <InvoiceFactsCard {invoice} />
  </div>

  <LineItemsTable
    {items}
    currency={invoice.currency}
    showVat={!invoice.isKleinunternehmer}
    subtotal={invoice.subtotal}
    vatAmount={invoice.vatAmount}
    total={invoice.total}
  />

  {#if invoice.paymentTerms && !invoice.isCreditNote}
    <TextSection title="Zahlungsbedingungen" text={invoice.paymentTerms} />
  {/if}
  {#if invoice.notes}
    <TextSection title="Notizen (auf der Rechnung)" text={invoice.notes} />
  {/if}

  {#if showPayments}
    <PaymentsCard {invoice} {payments} onChanged={load} />
  {/if}

  <SkontoCard {invoice} />

  {#if reminders.length > 0}
    <ReminderLevelsCard
      {reminders}
      nextLevel={creatableReminderLevel}
      onCreateNext={() => push(`/reminders/new/${invoice!.id}/${creatableReminderLevel}`)}
    />
  {/if}

  <InternalNotesCard {invoice} onSaved={load} />

  <ConfirmDialog
    bind:open={confirmDeleteOpen}
    title="Rechnung löschen?"
    description={`${displayInvoiceNumber(invoice)} wird unwiderruflich entfernt.`}
    confirmLabel="Löschen"
    destructive
    onConfirm={performDelete}
  />

  <ConfirmDialog
    bind:open={confirmCreditNoteOpen}
    title="Stornorechnung erstellen?"
    description={`Erstellt einen Entwurf, der ${displayInvoiceNumber(invoice)} vollständig storniert. Mengen lassen sich anschließend für Teilstornos anpassen.`}
    confirmLabel="Erstellen"
    destructive
    onConfirm={performCreateCreditNote}
  />

  <DateConfirmDialog
    bind:open={sendDialogOpen}
    bind:date={dialogDate}
    title="Als versendet markieren"
    description="Festschreiben unter neuer Rechnungsnummer."
    dateInputId="send-date"
    dateLabel="Versanddatum"
    hint="Standard ist heute. Für Nacherfassung das tatsächliche Versanddatum eintragen."
    confirmLabel="Versenden"
    warning={dialogWarning}
    onConfirm={confirmSend}
  />

  <DateConfirmDialog
    bind:open={paidDialogOpen}
    bind:date={dialogDate}
    title="Als bezahlt markieren"
    description="Zahldatum für Statistik und DATEV-Export."
    dateInputId="paid-date"
    dateLabel="Zahldatum"
    hint="Standard ist heute. Bei Nacherfassung das echte Zahldatum eintragen — Dashboard und Monats-Charts hängen davon ab."
    confirmLabel="Bestätigen"
    warning={dialogWarning}
    onConfirm={confirmPaid}
  />
{/if}
