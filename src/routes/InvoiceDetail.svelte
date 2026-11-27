<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { untrack } from "svelte";
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
  import { hasReleasedTimeEntries } from "$lib/db/audit";
  import { listPayments } from "$lib/db/invoice-payments";
  import { listRemindersForInvoice } from "$lib/db/reminders";
  import { countReleasableTimeEntries, releaseTimeEntriesOfReversedInvoice } from "$lib/db/time-billing";
  import type { Invoice, InvoiceItem, InvoicePayment, Reminder } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate, formatDateTime, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import {
    exportInvoiceXrechnung,
    generateInvoicePdf,
    listPdfVersions,
    previewInvoicePdf,
    type PdfVersion,
    type XrechnungExport,
  } from "$lib/sidecar/invoice";
  import { ensureCompanyDataComplete } from "$lib/utils/company-guard";
  import { resolveCustomerEmail, sendDocumentByMail } from "$lib/mail/send";
  import { validatePdf, type ValidationReport } from "$lib/validator";
  import { Badge, Button, ConfirmDialog, PageHeader, StatusBadge, toast, Panel } from "$lib/ui";
  import DocumentSheet from "$lib/components/DocumentSheet.svelte";
  import ValidationBadge from "$lib/components/ValidationBadge.svelte";
  import { renderInvoiceSheet } from "$lib/sidecar/preview";
  import { Check, CheckCircle2, FileSearch, FileWarning, Pencil } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { createDocumentActions, type PdfPreparation } from "./parts/entity/document-actions.svelte";
  import DocumentLoadMessage from "./parts/entity/DocumentLoadMessage.svelte";
  import DocumentFactsCard from "./parts/entity/DocumentFactsCard.svelte";
  import MailSendButton from "./parts/entity/MailSendButton.svelte";
  import PdfLocation from "./parts/entity/PdfLocation.svelte";
  import { parseCustomerSnapshot, UNREADABLE_SNAPSHOT_MESSAGE } from "./invoice/customer-snapshot";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { paidDateWarning, sendDateWarning } from "./invoice/date-warnings";
  import InternalNotesCard from "./invoice/InternalNotesCard.svelte";
  import InvoiceHistory from "./invoice/InvoiceHistory.svelte";
  import InvoicePdfActions from "./invoice/InvoicePdfActions.svelte";
  import NoticeCard from "./invoice/NoticeCard.svelte";
  import PaymentsCard from "./invoice/PaymentsCard.svelte";
  import PdfErrorNotice from "./invoice/PdfErrorNotice.svelte";
  import ReminderLevelsCard from "./invoice/ReminderLevelsCard.svelte";
  import { REMINDER_CREATE_LABEL } from "./invoice/reminder-levels";
  import { INVALID_ROUTE_ID_MESSAGE, parseRouteId } from "./invoice/route-id";
  import SkontoCard from "./invoice/SkontoCard.svelte";
  import { INVOICE_STATUS } from "./invoice/status";
  import TextSection from "./invoice/TextSection.svelte";
  import ValidationFindingsDialog from "./invoice/ValidationFindingsDialog.svelte";
  import { storeInvoiceValidation } from "./invoice/validation-store";
  import { actionsAt, buttonActions } from "./invoice/detail/action-plan";
  import DocumentActionsMenu from "./invoice/detail/DocumentActionsMenu.svelte";
  import { invoiceDateNote, invoiceTitle } from "./invoice/detail/document-note";
  import { issueActionLabel, issueDialogDescription, issuePanelText } from "./invoice/detail/issue-wording";
  import { invoiceFacts, invoiceSheetDates } from "./invoice/detail/document-facts";
  import FilesPanel from "./invoice/detail/FilesPanel.svelte";
  import { deriveInvoiceStanding } from "./invoice/detail/invoice-action-state";
  import { planInvoiceActions, type InvoiceActionId } from "./invoice/detail/invoice-action-plan";
  import { invoiceMenuEntries } from "./invoice/detail/invoice-menu";
  import { runPdfPreview } from "./invoice/detail/pdf-preview";
  import { PREVIEW_PDF_LABEL, PREVIEWING_LABEL } from "./invoice/detail/preview-menu";
  import { overdueDays, overdueLabel } from "./invoice/list-support";
  import { progressSteps } from "./invoice/detail/progress-steps";
  import ProgressSteps from "./invoice/detail/ProgressSteps.svelte";
  import { invoiceSheetKey } from "./invoice/detail/sheet-key";
  import { createSheetLoader } from "./invoice/detail/sheet-loader.svelte";
  import SheetFallback from "./invoice/detail/SheetFallback.svelte";
  import XrechnungMissing from "./invoice/detail/XrechnungMissing.svelte";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let invoice = $state<Invoice | null>(null);
  let items = $state<InvoiceItem[]>([]);
  let originalInvoice = $state<Invoice | null>(null);
  let creditNote = $state<Invoice | null>(null);
  let payments = $state<InvoicePayment[]>([]);
  let reminders = $state<Reminder[]>([]);
  let releasableTimeCount = $state(0);
  let timeReleasedOnOriginal = $state(false);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let loadToken = 0;

  const actions = createDocumentActions({ reload: load });
  const sheet = createSheetLoader(renderInvoiceSheet);
  let paymentsCard = $state<PaymentsCard>();

  let lastPdfPath = $state<string | null>(null);
  let customerEmail = $state<string | null>(null);
  // The mail program keeps the hand-off call open until its message window is closed.
  let mailing = $state(false);
  let xrechnungExport = $state<XrechnungExport | null>(null);
  let pdfVersions = $state<PdfVersion[]>([]);
  // Findings only exist in memory: the DB keeps status and count, not the report.
  let validationResult = $state<{ invoiceId: number; report: ValidationReport } | null>(null);
  // Invoices validated by an older build carry a stale 'unavailable' status; each is re-checked once.
  let autoRevalidatedId: number | null = null;

  let confirmDeleteOpen = $state(false);
  let confirmCancelOpen = $state(false);
  let confirmReopenOpen = $state(false);
  let confirmCreditNoteOpen = $state(false);
  let confirmReleaseTimeOpen = $state(false);
  // The dialog outlives the reload that follows a release, which resets releasableTimeCount.
  let confirmReleaseTimeCount = $state(0);
  let findingsDialogOpen = $state(false);
  let sendDialogOpen = $state(false);
  let issueForPdfDialogOpen = $state(false);
  let paidDialogOpen = $state(false);
  let dialogDate = $state(toIsoDate(nowUnix()));

  const customer = $derived(invoice ? parseCustomerSnapshot(invoice.customerSnapshot) : null);
  const revalidating = $derived(actions.task === "validate");
  const currentValidationReport = $derived(
    validationResult && validationResult.invoiceId === invoice?.id ? validationResult.report : null,
  );

  const dialogWarning = $derived.by(() => {
    if (!invoice || !dialogDate) return null;
    const ts = fromIsoDate(dialogDate);
    if (sendDialogOpen || issueForPdfDialogOpen) return sendDateWarning(ts, invoice.issueDate, nowUnix());
    if (paidDialogOpen) return paidDateWarning(ts, invoice, nowUnix());
    return null;
  });

  const standing = $derived(
    invoice
      ? deriveInvoiceStanding({
          invoice,
          paymentCount: payments.length,
          creditNote,
          reminderLevels: reminders.map((r) => r.level),
          hasPdf: !!lastPdfPath,
          timeReleasedOnOriginal,
          releasableTimeCount,
          now: nowUnix(),
        })
      : null,
  );
  const creditedCent = $derived(standing?.creditedCent ?? 0);
  const coverage = $derived(standing?.coverage ?? "none");
  const openCent = $derived(standing?.openCent ?? 0);
  const isOverdue = $derived(standing?.isOverdue ?? false);
  const creatableReminderLevel = $derived(standing?.creatableReminderLevel ?? null);
  const settlesRemainder = $derived(standing?.settlesRemainder ?? false);
  const paymentCardVisible = $derived(standing?.paymentCardVisible ?? false);
  const canMarkPaid = $derived(standing?.actionState.canRecordPayment ?? false);
  const lastPaymentAt = $derived(payments.reduce<number | null>((latest, p) => (latest === null || p.paidAt > latest ? p.paidAt : latest), null));

  const plan = $derived(standing ? planInvoiceActions(standing.actionState) : []);
  const buttonIds = $derived(buttonActions(plan));
  const mainId = $derived(actionsAt(plan, "main")[0] ?? null);
  const menuEntries = $derived(
    invoiceMenuEntries(actionsAt(plan, "menu"), {
      busy: actions.busy,
      mail: { hasAddress: !!customerEmail, mailProgramOpen: mailing },
      settlesRemainder,
      previewing: actions.previewing,
      onSelect: selectMenuAction,
    }),
  );
  const steps = $derived(
    invoice
      ? progressSteps({
          status: invoice.status,
          isCreditNote: invoice.isCreditNote,
          issueDate: invoice.issueDate,
          sentAt: invoice.sentAt,
          paidAt: invoice.paidAt,
          lastPaymentAt,
          reversedAt: coverage === "full" ? (creditNote?.issueDate ?? null) : null,
        })
      : [],
  );
  const showFiles = $derived(
    !!invoice &&
      (invoice.status !== "draft" ||
        !!lastPdfPath ||
        !!invoice.lastValidationStatus ||
        !!xrechnungExport ||
        actions.generating),
  );

  // load() reads the loaded document before its first await; tracked, every reload would retrigger itself.
  $effect(() => {
    void params?.id;
    untrack(load);
  });

  async function load() {
    const invoiceId = parseRouteId(params?.id);
    if (invoiceId === null) {
      invoice = null;
      sheet.clear();
      error = INVALID_ROUTE_ID_MESSAGE;
      loading = false;
      return;
    }
    const token = ++loadToken;
    // Reloading the invoice that is already shown keeps the page (scroll, dialogs) in place.
    if (invoice?.id !== invoiceId) {
      loading = true;
      actions.clearPdfError();
    }
    xrechnungExport = null;
    error = null;
    try {
      const res = await getInvoice(invoiceId);
      if (token !== loadToken) return;
      if (!res) {
        invoice = null;
        sheet.clear();
        error = "Rechnung nicht gefunden.";
        return;
      }
      const [versions, related, loadedPayments, loadedReminders, loadedEmail, loadedReleasableTime] = await Promise.all([
        fetchPdfVersions(res.invoice.pdfPath),
        fetchRelatedInvoices(res.invoice),
        fetchPayments(res.invoice),
        fetchReminders(res.invoice),
        fetchCustomerEmail(res.invoice),
        fetchReleasableTimeCount(res.invoice),
      ]);
      if (token !== loadToken) return;
      invoice = res.invoice;
      items = res.items;
      lastPdfPath = res.invoice.pdfPath;
      customerEmail = loadedEmail;
      pdfVersions = versions;
      originalInvoice = related.original;
      creditNote = related.creditNote;
      timeReleasedOnOriginal = related.timeReleasedOnOriginal;
      payments = loadedPayments;
      reminders = loadedReminders;
      releasableTimeCount = loadedReleasableTime;
      // Every change goes through load(), so the sheet follows issuing, payments and new PDFs.
      if (parseCustomerSnapshot(res.invoice.customerSnapshot)) {
        void sheet.load(res.invoice.id, invoiceSheetKey(res.invoice, res.items));
      } else {
        sheet.clear();
      }
      void maybeAutoRevalidate();
    } catch (e) {
      if (token === loadToken) {
        if (invoice?.id !== invoiceId) invoice = null;
        error = errorMessage(e);
      }
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  async function fetchRelatedInvoices(inv: Invoice) {
    const [original, creditNote, timeReleasedOnOriginal] = await Promise.all([
      inv.correctsInvoiceId ? getInvoice(inv.correctsInvoiceId) : null,
      inv.isCreditNote ? null : findCreditNoteFor(inv.id),
      inv.correctsInvoiceId ? hasReleasedTimeEntries(inv.correctsInvoiceId) : false,
    ]);
    return { original: original?.invoice ?? null, creditNote, timeReleasedOnOriginal };
  }

  async function fetchPayments(inv: Invoice): Promise<InvoicePayment[]> {
    try {
      return await listPayments(inv.id);
    } catch (e) {
      toast.error("Zahlungen konnten nicht geladen werden", errorMessage(e));
      return [];
    }
  }

  async function fetchReminders(inv: Invoice): Promise<Reminder[]> {
    if (inv.isCreditNote) return [];
    try {
      return await listRemindersForInvoice(inv.id);
    } catch (e) {
      toast.error("Mahnungen konnten nicht geladen werden", errorMessage(e));
      return [];
    }
  }

  async function fetchReleasableTimeCount(inv: Invoice): Promise<number> {
    try {
      return await countReleasableTimeEntries(inv.id);
    } catch (e) {
      toast.error("Abgerechnete Zeiten konnten nicht geprüft werden", errorMessage(e));
      return 0;
    }
  }

  function fetchCustomerEmail(inv: Invoice): Promise<string | null> {
    return resolveCustomerEmail(inv.customerId, parseCustomerSnapshot(inv.customerSnapshot)?.email ?? null);
  }

  async function fetchPdfVersions(pdfPath: string | null): Promise<PdfVersion[]> {
    if (!pdfPath) return [];
    try {
      return await listPdfVersions(pdfPath);
    } catch (e) {
      toast.error("PDF-Versionen konnten nicht geladen werden", errorMessage(e));
      return [];
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
    if (!invoice || actions.busy) return;
    const { id } = invoice;
    const sentAt = fromIsoDate(dialogDate);
    sendDialogOpen = false;
    if (!(await ensureCompanyDataComplete())) return;
    await actions.run("Als versendet markiert", () => markSent(id, sentAt));
  }

  async function confirmPaid() {
    if (!invoice || actions.busy) return;
    const { id } = invoice;
    const paidAt = fromIsoDate(dialogDate);
    paidDialogOpen = false;
    await actions.run(settlesRemainder ? "Restbetrag als bezahlt markiert" : "Als bezahlt markiert", () =>
      markPaid(id, paidAt),
    );
  }

  async function performDelete() {
    if (!invoice) return;
    const { id } = invoice;
    await actions.remove({
      remove: () => deleteInvoice(id),
      deletedLabel: "Rechnung gelöscht",
      redirectTo: "/invoices",
    });
  }

  async function performCreateCreditNote() {
    if (!invoice) return;
    const { id } = invoice;
    await actions.exclusive("credit-note", async () => {
      try {
        const newId = await createCreditNoteFromInvoice(id);
        const created = await getInvoice(newId);
        const label = created ? displayInvoiceNumber(created.invoice) : `#${newId}`;
        toast.success(`Stornorechnung ${label} erstellt`);
        push(`/invoices/${newId}/edit`);
      } catch (e) {
        toast.error("Stornorechnung fehlgeschlagen", errorMessage(e));
      }
    });
  }

  function performReleaseTime() {
    if (!invoice) return;
    const { id } = invoice;
    const count = confirmReleaseTimeCount;
    return actions.run(`${count === 1 ? "1 Zeiteintrag" : `${count} Zeiteinträge`} wieder freigegeben`, () =>
      releaseTimeEntriesOfReversedInvoice(id),
    );
  }

  function rememberValidation(invoiceId: number, report: ValidationReport) {
    validationResult = { invoiceId, report };
  }

  async function maybeAutoRevalidate() {
    if (!invoice || !lastPdfPath) return;
    if (invoice.lastValidationStatus !== "unavailable") return;
    if (autoRevalidatedId === invoice.id) return;
    const invoiceId = invoice.id;
    autoRevalidatedId = invoiceId;
    try {
      const report = await validatePdf(lastPdfPath);
      const lastValidationStatus = await storeInvoiceValidation(invoiceId, report);
      // The route may have moved on to another invoice while the validator was running.
      if (invoice?.id !== invoiceId) return;
      rememberValidation(invoiceId, report);
      invoice = { ...invoice, lastValidationStatus };
    } catch {
      // Validator still unavailable or PDF without XML: keep the old status, no noise.
    }
  }

  /** Validates the current PDF and returns the report, or null when validation failed or was skipped. */
  async function revalidate(): Promise<ValidationReport | null> {
    if (!invoice || !lastPdfPath) return null;
    const invoiceId = invoice.id;
    const pdfPath = lastPdfPath;
    let report: ValidationReport | null = null;
    await actions.exclusive("validate", async () => {
      try {
        const validated = await validatePdf(pdfPath);
        await storeInvoiceValidation(invoiceId, validated);
        if (invoice?.id !== invoiceId) return;
        rememberValidation(invoiceId, validated);
        await load();
        report = validated;
      } catch (e) {
        toast.error("Validierung fehlgeschlagen", errorMessage(e));
      }
    });
    return report;
  }

  async function onRevalidate() {
    const report = await revalidate();
    if (report) announceValidation(report);
  }

  function openFindingsDialog() {
    findingsDialogOpen = true;
    if (!currentValidationReport && lastPdfPath && !actions.busy) void revalidate();
  }

  function announceValidation(report: ValidationReport) {
    if (report.valid) {
      toast.success("Validierung bestanden", `Szenario: ${report.scenario ?? "—"}`);
    } else {
      toast.action(
        `${report.findings.length} Meldungen`,
        { label: "Details", onClick: openFindingsDialog },
        { description: report.findings[0]?.message },
      );
    }
  }

  /** What the PDF is for: just to have it, or to attach it to an e-mail right away. */
  type PdfPurpose = "pdf" | "mail";
  // Read when the issue dialog is confirmed; every opening of the dialog sets it again.
  let issuePurpose = $state<PdfPurpose>("pdf");

  function requestPdf(purpose: PdfPurpose = "pdf") {
    if (!invoice || actions.busy) return;
    if (invoice.status === "draft") {
      issuePurpose = purpose;
      dialogDate = toIsoDate(nowUnix());
      issueForPdfDialogOpen = true;
      return;
    }
    void generatePdf(purpose);
  }

  /** A draft always goes through issuing first, which also (re)creates the PDF. */
  function requestMail() {
    if (!invoice || actions.busy || mailing) return;
    if (lastPdfPath && invoice.status !== "draft") void sendMail(lastPdfPath);
    else requestPdf("mail");
  }

  async function confirmIssueAndGeneratePdf() {
    if (!invoice || actions.busy) return;
    const { id } = invoice;
    const sentAt = fromIsoDate(dialogDate);
    issueForPdfDialogOpen = false;
    if (!(await ensureCompanyDataComplete())) return;
    await generatePdf(issuePurpose, { run: () => markSent(id, sentAt), failureTitle: "Festschreiben fehlgeschlagen" });
  }

  async function generatePdf(purpose: PdfPurpose, issueFirst?: PdfPreparation) {
    if (!invoice) return;
    const { id } = invoice;
    await actions.generatePdf(
      () => generateInvoicePdf(id),
      async ({ pdfPath, kositReport }) => {
        lastPdfPath = pdfPath;
        if (kositReport) rememberValidation(id, kositReport);
        sheet.invalidate();
        await load();
        if (purpose === "pdf") {
          announcePdfCreated(pdfPath, kositReport);
          return;
        }
        announceFindingsBeforeMail(kositReport);
        // Not awaited: the mail program holds the call open and must not keep the page busy.
        void sendMail(pdfPath);
      },
      issueFirst,
    );
  }

  function announceFindingsBeforeMail(report: ValidationReport | null | undefined) {
    if (report && !report.valid) {
      toast.warning(`${report.findings.length} KoSIT-Meldungen`, "Versand erst nach Korrektur empfohlen.");
    }
  }

  async function sendMail(pdfPath: string) {
    if (!invoice || !customerEmail || mailing) return;
    const sent = invoice;
    mailing = true;
    try {
      await sendDocumentByMail(
        sent.isCreditNote ? "creditNote" : "invoice",
        {
          number: displayInvoiceNumber(sent),
          correctsInvoiceNumber: originalInvoice?.number ?? null,
          totalCent: sent.total,
          currency: sent.currency,
          dueDate: sent.dueDate,
          customer: customer?.name ?? "",
        },
        { to: customerEmail, attachmentPath: pdfPath },
      );
    } catch (e) {
      toast.error("E-Mail konnte nicht vorbereitet werden", errorMessage(e));
    } finally {
      mailing = false;
    }
  }

  async function exportXrechnung() {
    if (!invoice) return;
    const { id } = invoice;
    await actions.exclusive("action", async () => {
      try {
        xrechnungExport = await exportInvoiceXrechnung(id);
        if (xrechnungExport.status === "exported") toast.success("XRechnung exportiert");
        else toast.warning("XRechnung nicht möglich", "Pflichtangaben fehlen, Details unter Dateien.");
      } catch (e) {
        toast.error("XRechnung-Export fehlgeschlagen", errorMessage(e));
      }
    });
  }

  async function revealXrechnung(xmlPath: string) {
    try {
      await revealItemInDir(xmlPath);
    } catch (e) {
      toast.error("Ordner konnte nicht geöffnet werden", errorMessage(e));
    }
  }

  function announcePdfCreated(pdfPath: string, report: ValidationReport | null | undefined) {
    const openAction = { label: "Öffnen", onClick: () => openPath(pdfPath) };
    if (report && !report.valid) {
      toast.action(`PDF erstellt · ${report.findings.length} KoSIT-Meldungen`, openAction, {
        description: "Versand erst nach Korrektur empfohlen.",
      });
    } else {
      toast.action(report?.valid ? "PDF erstellt · ZUGFeRD-konform" : "PDF erstellt", openAction);
    }
  }

  function previewPdf() {
    if (!invoice) return;
    const { id } = invoice;
    return runPdfPreview(actions, () => previewInvoicePdf(id));
  }

  function selectMenuAction(id: InvoiceActionId) {
    if (!invoice) return;
    switch (id) {
      case "preview-pdf":
        void previewPdf();
        break;
      case "send-mail":
        requestMail();
        break;
      case "mark-sent":
        openSendDialog();
        break;
      case "mark-paid":
        openPaidDialog();
        break;
      case "regenerate-pdf":
        requestPdf();
        break;
      case "export-xrechnung":
        void exportXrechnung();
        break;
      case "save-recurring":
        push(`/recurring/new?fromInvoice=${invoice.id}`);
        break;
      case "release-time":
        confirmReleaseTimeCount = releasableTimeCount;
        confirmReleaseTimeOpen = true;
        break;
      case "create-credit-note":
        confirmCreditNoteOpen = true;
        break;
      case "reopen-draft":
        confirmReopenOpen = true;
        break;
      case "cancel":
        confirmCancelOpen = true;
        break;
      case "delete":
        confirmDeleteOpen = true;
        break;
    }
  }
</script>

{#if loading || !invoice || !customer}
  <header class="mb-6">
    <BackLink href="/invoices">Rechnungen</BackLink>
  </header>
{/if}

<DocumentLoadMessage
  {loading}
  {error}
  hasDocument={!!invoice}
  unreadable={!customer}
  unreadableMessage={UNREADABLE_SNAPSHOT_MESSAGE}
/>

{#if !loading && invoice && customer}
  {#snippet headerBadges()}
    {#if invoice}
      <StatusBadge status={invoice.status} table={INVOICE_STATUS} />
      {#if isOverdue}
        <Badge variant="late">{overdueLabel(overdueDays(invoice.dueDate, nowUnix()))}</Badge>
      {/if}
      {#if invoice.lastValidationStatus || lastPdfPath}
        <button
          type="button"
          class="inline-flex cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Validierungsdetails anzeigen"
          onclick={openFindingsDialog}
        >
          <ValidationBadge
            compact
            status={invoice.lastValidationStatus}
            findingsCount={invoice.lastValidationFindingsCount}
          />
        </button>
      {/if}
    {/if}
  {/snippet}

  {#snippet headerSubtitle()}
    {#if invoice && customer}
      {@const dateNote = invoiceDateNote(invoice)}
      <a href={`/customers/${invoice.customerId}`} use:link class="hover:text-foreground hover:underline">{customer.name}</a>,
      <span class="tabular-nums">{formatMoney(invoice.total, invoice.currency)}</span>{#if dateNote}, {dateNote}{/if}
    {/if}
  {/snippet}

  {#snippet headerButtons()}
    {#if invoice}
      {#each buttonIds as id (id)}
        {#if id === "open-pdf" || id === "generate-pdf"}
          <InvoicePdfActions
            hasPdf={id === "open-pdf"}
            busy={actions.busy}
            generating={actions.generating}
            {revalidating}
            onGenerate={() => requestPdf()}
            onOpen={() => actions.usePdfFile(lastPdfPath, openPath)}
            onReveal={() => actions.usePdfFile(lastPdfPath, revealItemInDir)}
            {onRevalidate}
          />
        {:else if id === "edit"}
          <Button variant="outline" disabled={actions.busy} onclick={() => push(`/invoices/${invoice!.id}/edit`)}>
            <Pencil />
            Bearbeiten
          </Button>
        {:else if id === "preview-pdf"}
          <Button variant="outline" disabled={actions.busy} onclick={previewPdf}>
            <FileSearch />
            {actions.previewing ? PREVIEWING_LABEL : PREVIEW_PDF_LABEL}
          </Button>
        {:else if id === "send-mail"}
          <MailSendButton email={customerEmail} busy={actions.busy} sending={mailing} onSend={requestMail} />
        {:else if id === "record-payment"}
          <Button
            variant={mainId === id ? "default" : "outline"}
            disabled={actions.busy}
            onclick={() => paymentsCard?.openDialog()}
          >
            <CheckCircle2 />
            Zahlung erfassen
          </Button>
        {:else if id === "create-reminder" && creatableReminderLevel}
          <Button disabled={actions.busy} onclick={() => push(`/reminders/new/${invoice!.id}/${creatableReminderLevel}`)}>
            <FileWarning />
            {REMINDER_CREATE_LABEL[creatableReminderLevel]}
          </Button>
        {:else if id === "issue"}
          <Button disabled={actions.busy} onclick={() => requestPdf()}>
            <Check />
            {actions.generating ? "Erzeuge…" : issueActionLabel(invoice)}
          </Button>
        {/if}
      {/each}
      {#if menuEntries.length > 0}
        <DocumentActionsMenu entries={menuEntries} />
      {/if}
    {/if}
  {/snippet}

  <PageHeader
    title={invoiceTitle(invoice)}
    back={{ href: "/invoices", label: "Rechnungen" }}
    badges={headerBadges}
    subtitle={headerSubtitle}
    actions={headerButtons}
    wrap
  />

  <ProgressSteps {steps} />

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

  {#if creditNote}
    {#snippet creditNoteLink(note: Invoice)}
      <a
        href={`/invoices/${note.id}`}
        use:link
        class="font-mono font-medium text-foreground hover:underline"
      >{displayInvoiceNumber(note)}</a>
    {/snippet}
    {#if coverage === "full"}
      <NoticeCard tone="warning" title="Storniert">
        <div class="mt-0.5 text-muted-foreground">
          Wurde storniert durch {@render creditNoteLink(creditNote)}.
        </div>
      </NoticeCard>
    {:else if coverage === "partial"}
      <NoticeCard tone="warning" title="Teilweise storniert">
        <div class="mt-0.5 text-muted-foreground">
          Teilweise storniert durch {@render creditNoteLink(creditNote)}
          (−{formatMoney(creditedCent, invoice.currency)}). Offen: {formatMoney(openCent, invoice.currency)}
        </div>
      </NoticeCard>
    {:else}
      <NoticeCard tone="warning" title="Storno in Vorbereitung">
        <div class="mt-0.5 text-muted-foreground">
          Die Stornorechnung {@render creditNoteLink(creditNote)} ist noch ein Entwurf. Bis sie
          ausgestellt ist, bleibt diese Rechnung offen.
        </div>
      </NoticeCard>
    {/if}
  {/if}

  {#if actions.pdfError}
    <PdfErrorNotice message={actions.pdfError} />
  {/if}

  <div class="grid items-start gap-7 min-[1321px]:grid-cols-[minmax(0,1fr)_320px]">
    <div class="min-w-0 space-y-3">
      <DocumentSheet
        html={sheet.html}
        loading={sheet.loading}
        error={sheet.error}
        title={`Rechnung ${displayInvoiceNumber(invoice)}`}
      />
      {#if sheet.error}
        <SheetFallback
          {customer}
          dates={invoiceSheetDates(invoice)}
          {items}
          currency={invoice.currency}
          showVat={!invoice.isKleinunternehmer}
          subtotal={invoice.subtotal}
          vatAmount={invoice.vatAmount}
          total={invoice.total}
        >
          {#snippet texts()}
            {#if invoice && invoice.paymentTerms && !invoice.isCreditNote}
              <TextSection title="Zahlungsbedingungen" text={invoice.paymentTerms} />
            {/if}
            {#if invoice?.notes}
              <TextSection title="Notizen (auf der Rechnung)" text={invoice.notes} />
            {/if}
          {/snippet}
        </SheetFallback>
      {:else if sheet.html && invoice.status !== "draft"}
        <p class="text-xs text-muted-foreground">
          Das Blatt zeigt den Stand nach den aktuellen Vorlagen. Maßgeblich ist die archivierte PDF.
        </p>
      {/if}
    </div>

    <aside aria-label="Weitere Angaben" class="grid grid-cols-2 items-start gap-3.5 min-[1321px]:grid-cols-1">
      {#if paymentCardVisible}
        <PaymentsCard
          bind:this={paymentsCard}
          {invoice}
          {creditedCent}
          {payments}
          canAddPayment={canMarkPaid}
          onChanged={load}
        />
      {/if}

      {#if invoice.status === "draft"}
        <Panel title="Vor dem Ausstellen">
          <p class="text-sm text-muted-foreground">{issuePanelText(invoice)}</p>
        </Panel>
      {/if}

      <SkontoCard {invoice} />

      {#if showFiles}
        <FilesPanel pdfPath={lastPdfPath} versions={pdfVersions} generating={actions.generating}>
          {#if invoice.lastValidatedAt}
            <p class="text-xs text-muted-foreground">Validiert am {formatDateTime(invoice.lastValidatedAt)}</p>
          {/if}
          {#if xrechnungExport?.status === "exported"}
            {@const xmlPath = xrechnungExport.xmlPath}
            <PdfLocation
              label="XRechnung"
              path={xmlPath}
              openLabel="Ordner öffnen"
              class="mb-0"
              onOpen={() => revealXrechnung(xmlPath)}
            />
          {:else if xrechnungExport?.status === "incomplete"}
            <XrechnungMissing missing={xrechnungExport.missing} customerId={invoice.customerId} />
          {/if}
        </FilesPanel>
      {/if}

      {#if reminders.length > 0}
        <ReminderLevelsCard {reminders} />
      {/if}

      <DocumentFactsCard facts={invoiceFacts(invoice)} />

      <InternalNotesCard {invoice} onSaved={load} />

      <InvoiceHistory {invoice} />
    </aside>
  </div>

  <ConfirmDialog
    bind:open={confirmDeleteOpen}
    title="Rechnung löschen?"
    description={`${displayInvoiceNumber(invoice)} wird unwiderruflich entfernt.`}
    confirmLabel="Löschen"
    destructive
    onConfirm={performDelete}
  />

  <ConfirmDialog
    bind:open={confirmCancelOpen}
    title="Entwurf stornieren?"
    description={`${displayInvoiceNumber(invoice)} wird als storniert markiert und lässt sich nicht mehr bearbeiten.`}
    confirmLabel="Stornieren"
    destructive
    onConfirm={() => actions.run("Storniert", () => cancelInvoice(invoice!.id))}
  />

  <ConfirmDialog
    bind:open={confirmReopenOpen}
    title="Zurück zu Entwurf?"
    description={`${displayInvoiceNumber(invoice)} gilt danach wieder als unversendet. Die vergebene Rechnungsnummer bleibt bestehen; bereits verschickte PDFs stimmen nicht mehr mit dem Entwurf überein.`}
    confirmLabel="Zu Entwurf machen"
    destructive
    onConfirm={() => actions.run("Zurück zu Entwurf", () => reopenDraft(invoice!.id))}
  />

  <ConfirmDialog
    bind:open={confirmCreditNoteOpen}
    title="Stornorechnung erstellen?"
    description={`Erstellt einen Entwurf, der ${displayInvoiceNumber(invoice)} vollständig storniert. Mengen lassen sich anschließend für Teilstornos anpassen.`}
    confirmLabel="Erstellen"
    destructive
    onConfirm={performCreateCreditNote}
  />

  <ConfirmDialog
    bind:open={confirmReleaseTimeOpen}
    title="Zeiten wieder freigeben?"
    description={`${displayInvoiceNumber(invoice)} ist vollständig storniert. ${confirmReleaseTimeCount === 1 ? "1 abgerechneter Zeiteintrag wird" : `${confirmReleaseTimeCount} abgerechnete Zeiteinträge werden`} wieder offen und lässt sich erneut abrechnen. Die Freigabe wird im Änderungsverlauf protokolliert.`}
    confirmLabel="Freigeben"
    onConfirm={performReleaseTime}
  />

  <DateConfirmDialog
    bind:open={sendDialogOpen}
    bind:date={dialogDate}
    title="Als versendet markieren"
    description={issueDialogDescription(invoice, "mark")}
    dateInputId="send-date"
    dateLabel="Versendet am"
    hint="Standard ist heute. Für Nacherfassung das tatsächliche Datum eintragen."
    confirmLabel="Als versendet markieren"
    warning={dialogWarning}
    busy={actions.busy}
    onConfirm={confirmSend}
  />

  <DateConfirmDialog
    bind:open={issueForPdfDialogOpen}
    bind:date={dialogDate}
    title={`${issueActionLabel(invoice)}?`}
    description={issueDialogDescription(invoice, issuePurpose)}
    dateInputId="issue-pdf-date"
    dateLabel="Versendet am"
    hint="Standard ist heute. Für Nacherfassung das tatsächliche Datum eintragen."
    confirmLabel={issueActionLabel(invoice)}
    warning={dialogWarning}
    busy={actions.busy}
    onConfirm={confirmIssueAndGeneratePdf}
  />

  <DateConfirmDialog
    bind:open={paidDialogOpen}
    bind:date={dialogDate}
    title={settlesRemainder ? "Restbetrag als bezahlt markieren" : "Als bezahlt markieren"}
    description={settlesRemainder
      ? "Der offene Restbetrag wird als Zahlung erfasst."
      : "Zahldatum für Statistik und DATEV-Export."}
    dateInputId="paid-date"
    dateLabel="Zahldatum"
    hint="Standard ist heute. Bei Nacherfassung das echte Zahldatum eintragen — Übersicht und Monatsdiagramme hängen davon ab."
    confirmLabel="Bestätigen"
    warning={dialogWarning}
    busy={actions.busy}
    onConfirm={confirmPaid}
  />

  <ValidationFindingsDialog
    bind:open={findingsDialogOpen}
    report={currentValidationReport}
    running={revalidating}
    hasPdf={!!lastPdfPath}
    onRevalidate={revalidate}
  />
{/if}
