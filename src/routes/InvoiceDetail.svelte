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
  import { creditedCentOf, isSettledByCreditNote, openBalanceCent } from "$lib/db/invoice-lifecycle";
  import { listPayments } from "$lib/db/invoice-payments";
  import { listRemindersForInvoice } from "$lib/db/reminders";
  import type { Invoice, InvoiceItem, InvoicePayment, Reminder } from "$lib/db/schema";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate, formatDateTime, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { generateInvoicePdf, listPdfVersions, type PdfVersion } from "$lib/sidecar/invoice";
  import { ensureCompanyDataComplete } from "$lib/utils/company-guard";
  import { resolveCustomerEmail, sendDocumentByMail } from "$lib/mail/send";
  import { validatePdf, type ValidationReport } from "$lib/validator";
  import { Badge, Button, ConfirmDialog, toast } from "$lib/ui";
  import ValidationBadge from "$lib/components/ValidationBadge.svelte";
  import { CheckCircle2, Send } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { createDocumentActions, type PdfPreparation } from "./parts/entity/document-actions.svelte";
  import DocumentLoadMessage from "./parts/entity/DocumentLoadMessage.svelte";
  import MailSendButton from "./parts/entity/MailSendButton.svelte";
  import PdfLocation from "./parts/entity/PdfLocation.svelte";
  import { parseCustomerSnapshot, UNREADABLE_SNAPSHOT_MESSAGE } from "./invoice/customer-snapshot";
  import CustomerSnapshotCard from "./invoice/CustomerSnapshotCard.svelte";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { paidDateWarning, sendDateWarning } from "./invoice/date-warnings";
  import InternalNotesCard from "./invoice/InternalNotesCard.svelte";
  import {
    canCreateCreditNote as creditNoteAllowed,
    canRecordPayments,
    canReopenAsDraft,
    creditNoteCoverage,
    isOverdue as isInvoiceOverdue,
    showsPayments,
  } from "./invoice/invoice-actions";
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
  import ValidationFindingsDialog from "./invoice/ValidationFindingsDialog.svelte";
  import { storeInvoiceValidation } from "./invoice/validation-store";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let invoice = $state<Invoice | null>(null);
  let items = $state<InvoiceItem[]>([]);
  let originalInvoice = $state<Invoice | null>(null);
  let creditNote = $state<Invoice | null>(null);
  const creditedCent = $derived(creditedCentOf(creditNote));
  const settledByCreditNote = $derived(!!invoice && isSettledByCreditNote({ ...invoice, creditedCent }));
  const coverage = $derived(invoice ? creditNoteCoverage(invoice, creditedCent) : "none");
  const openCent = $derived(invoice ? Math.max(0, openBalanceCent({ ...invoice, creditedCent })) : 0);
  let payments = $state<InvoicePayment[]>([]);
  let reminders = $state<Reminder[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let loadToken = 0;

  const actions = createDocumentActions({ reload: load });

  let lastPdfPath = $state<string | null>(null);
  let customerEmail = $state<string | null>(null);
  // The mail program keeps the hand-off call open until its message window is closed.
  let mailing = $state(false);
  let pdfVersions = $state<PdfVersion[]>([]);
  // Findings only exist in memory: the DB keeps status and count, not the report.
  let validationResult = $state<{ invoiceId: number; report: ValidationReport } | null>(null);
  // Invoices validated by an older build carry a stale 'unavailable' status; each is re-checked once.
  let autoRevalidatedId: number | null = null;

  let confirmDeleteOpen = $state(false);
  let confirmCancelOpen = $state(false);
  let confirmReopenOpen = $state(false);
  let confirmCreditNoteOpen = $state(false);
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

  const paymentCardVisible = $derived(
    !!invoice && showsPayments(invoice, payments.length, settledByCreditNote),
  );
  const canMarkPaid = $derived(!!invoice && canRecordPayments(invoice, settledByCreditNote));
  const canCreateCreditNote = $derived(
    !!invoice && creditNoteAllowed(invoice, !!creditNote),
  );
  const canReopenDraft = $derived(
    !!invoice && canReopenAsDraft(invoice, payments.length, !!creditNote),
  );
  const isOverdue = $derived(
    !!invoice && isInvoiceOverdue(invoice, settledByCreditNote, nowUnix()),
  );
  const existingReminderLevels = $derived(reminders.map((r) => r.level).filter(isReminderLevel));
  const creatableReminderLevel = $derived(
    isOverdue && !existingReminderLevels.includes(3) ? nextReminderLevel(existingReminderLevels) : null,
  );
  const settlesRemainder = $derived(invoice?.status === "partial" || creditedCent > 0);

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
    const token = ++loadToken;
    // Reloading the invoice that is already shown keeps the page (scroll, dialogs) in place.
    if (invoice?.id !== invoiceId) {
      loading = true;
      actions.clearPdfError();
    }
    error = null;
    try {
      const res = await getInvoice(invoiceId);
      if (token !== loadToken) return;
      if (!res) {
        invoice = null;
        error = "Rechnung nicht gefunden.";
        return;
      }
      const [versions, related, loadedPayments, loadedReminders, loadedEmail] = await Promise.all([
        fetchPdfVersions(res.invoice.pdfPath),
        fetchRelatedInvoices(res.invoice),
        fetchPayments(res.invoice),
        fetchReminders(res.invoice),
        fetchCustomerEmail(res.invoice),
      ]);
      if (token !== loadToken) return;
      invoice = res.invoice;
      items = res.items;
      lastPdfPath = res.invoice.pdfPath;
      customerEmail = loadedEmail;
      pdfVersions = versions;
      originalInvoice = related.original;
      creditNote = related.creditNote;
      payments = loadedPayments;
      reminders = loadedReminders;
      void maybeAutoRevalidate();
    } catch (e) {
      if (token === loadToken) {
        if (invoice?.id !== invoiceId) invoice = null;
        error = String(e);
      }
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  async function fetchRelatedInvoices(inv: Invoice) {
    const [original, creditNote] = await Promise.all([
      inv.correctsInvoiceId ? getInvoice(inv.correctsInvoiceId) : null,
      inv.isCreditNote ? null : findCreditNoteFor(inv.id),
    ]);
    return { original: original?.invoice ?? null, creditNote };
  }

  async function fetchPayments(inv: Invoice): Promise<InvoicePayment[]> {
    try {
      return await listPayments(inv.id);
    } catch (e) {
      toast.error("Zahlungen konnten nicht geladen werden", String(e));
      return [];
    }
  }

  async function fetchReminders(inv: Invoice): Promise<Reminder[]> {
    if (inv.isCreditNote) return [];
    try {
      return await listRemindersForInvoice(inv.id);
    } catch (e) {
      toast.error("Mahnungen konnten nicht geladen werden", String(e));
      return [];
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
      toast.error("PDF-Versionen konnten nicht geladen werden", String(e));
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
        toast.error("Stornorechnung fehlgeschlagen", String(e));
      }
    });
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
        toast.error("Validierung fehlgeschlagen", String(e));
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
        `${report.findings.length} Findings`,
        { label: "Details", onClick: openFindingsDialog },
        { description: report.findings[0]?.message },
      );
    }
  }

  /** What the PDF is for: just to have it, or to attach it to an e-mail right away. */
  type PdfPurpose = "pdf" | "mail";
  // Read when the issue dialog is confirmed; every opening of the dialog sets it again.
  let issuePurpose: PdfPurpose = "pdf";

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
      toast.warning(`${report.findings.length} KoSIT-Findings`, "Versand erst nach Korrektur empfohlen.");
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
      toast.error("E-Mail konnte nicht vorbereitet werden", String(e));
    } finally {
      mailing = false;
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
</script>

<header class="mb-6">
  <BackLink href="/invoices">Rechnungen</BackLink>
</header>

<DocumentLoadMessage
  {loading}
  {error}
  hasDocument={!!invoice}
  unreadable={!customer}
  unreadableMessage={UNREADABLE_SNAPSHOT_MESSAGE}
/>

{#if !loading && invoice && customer}
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

  <div class="flex flex-col @3xl:flex-row @3xl:items-start @3xl:justify-between gap-4 mb-6">
    <div class="min-w-0">
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
        {#if isOverdue}
          <Badge variant="destructive">Überfällig</Badge>
        {/if}
        {#if invoice.lastValidationStatus || lastPdfPath}
          <button
            type="button"
            class="inline-flex cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Validierungsdetails anzeigen"
            onclick={openFindingsDialog}
          >
            <ValidationBadge
              status={invoice.lastValidationStatus}
              findingsCount={invoice.lastValidationFindingsCount}
            />
          </button>
        {/if}
      </div>
      <p class="text-sm text-muted-foreground mt-1.5">
        {customer.name} · {formatDate(invoice.issueDate)}
        {#if invoice.lastValidatedAt}
          · validiert {formatDateTime(invoice.lastValidatedAt)}
        {/if}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <InvoicePdfActions
        hasPdf={!!lastPdfPath}
        busy={actions.busy}
        generating={actions.generating}
        {revalidating}
        onGenerate={() => requestPdf()}
        onOpen={() => actions.usePdfFile(lastPdfPath, openPath)}
        onReveal={() => actions.usePdfFile(lastPdfPath, revealItemInDir)}
        {onRevalidate}
      />

      <MailSendButton email={customerEmail} busy={actions.busy} sending={mailing} onSend={requestMail} />

      {#if invoice.status === "draft"}
        <Button disabled={actions.busy} onclick={openSendDialog}>
          <Send />
          Als versendet markieren
        </Button>
      {:else if canMarkPaid}
        <Button disabled={actions.busy} onclick={openPaidDialog}>
          <CheckCircle2 />
          {settlesRemainder ? "Restbetrag bezahlt" : "Bezahlt"}
        </Button>
      {/if}

      <InvoiceActionsMenu
        {invoice}
        {creatableReminderLevel}
        {canCreateCreditNote}
        {canReopenDraft}
        busy={actions.busy}
        onRequestReopenDraft={() => (confirmReopenOpen = true)}
        onRequestCancel={() => (confirmCancelOpen = true)}
        onRequestCreditNote={() => (confirmCreditNoteOpen = true)}
        onRequestDelete={() => (confirmDeleteOpen = true)}
      />
    </div>
  </div>

  {#if actions.pdfError}
    <PdfErrorNotice message={actions.pdfError} />
  {:else if lastPdfPath}
    {#if pdfVersions.length > 0}
      <PdfVersionList versions={pdfVersions} />
    {:else}
      <PdfLocation path={lastPdfPath} />
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

  {#if paymentCardVisible}
    <PaymentsCard {invoice} {creditedCent} {payments} canAddPayment={canMarkPaid} onChanged={load} />
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

  <DateConfirmDialog
    bind:open={sendDialogOpen}
    bind:date={dialogDate}
    title="Als versendet markieren"
    description="Festschreiben unter neuer Rechnungsnummer."
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
    title="Rechnung festschreiben?"
    description="Vergibt die Rechnungsnummer und setzt den Status auf Versendet. Erst danach wird die PDF erzeugt."
    dateInputId="issue-pdf-date"
    dateLabel="Versendet am"
    hint="Standard ist heute. Für Nacherfassung das tatsächliche Datum eintragen."
    confirmLabel="Festschreiben und PDF erzeugen"
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
    hint="Standard ist heute. Bei Nacherfassung das echte Zahldatum eintragen — Dashboard und Monats-Charts hängen davon ab."
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
