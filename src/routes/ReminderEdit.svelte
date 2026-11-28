<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { onDestroy, tick, untrack } from "svelte";
  import { guardUnsavedChanges } from "$lib/utils/unsaved-guard.svelte";
  import { link, push, replace } from "svelte-spa-router";
  import {
    buildReminderDraft,
    createReminder,
    deleteReminder,
    getReminder,
    levelLabel,
    markReminderSent,
    remindableAmountCents,
    updateReminder,
    type ReminderFields,
  } from "$lib/db/reminders";
  import { DEFAULT_CURRENCY } from "$lib/db/doc-queries";
  import { getInvoice, loadCreditedCent } from "$lib/db/invoices";
  import type { Invoice, Reminder, ReminderInvoiceSnapshot, ReminderLevel } from "$lib/db/schema";
  import { parseSnapshot } from "$lib/db/snapshot-json";
  import { fromIsoDate, toIsoDate, formatDate, nowUnix } from "$lib/utils/date";
  import { formatMoney } from "$lib/utils/currency";
  import { eurStringToCents } from "$lib/utils/money";
  import { generateReminderPdf } from "$lib/sidecar/reminder";
  import { COMPANY_INCOMPLETE_CODE } from "$lib/sidecar/company-guard";
  import { ensureCompanyDataComplete, notifyCompanyIncomplete } from "$lib/utils/company-guard";
  import { resolveCustomerEmail, sendDocumentByMail } from "$lib/mail/send";
  import {
    Button,
    Card,
    ConfirmDialog,
    DatePicker,
    DropdownItem,
    DropdownMenu,
    Field,
    FieldGrid,
    FormSection,
    Input,
    MoreActionsTrigger,
    PageHeader,
    StatusBadge,
    Textarea,
    toast,
  } from "$lib/ui";
  import { FileText, Send, Trash2 } from "$lib/brand-icons";
  import { openPath } from "@tauri-apps/plugin-opener";
  import { renderReminderSheet } from "$lib/sidecar/preview";
  import DocumentSheet from "$lib/components/DocumentSheet.svelte";
  import { parseCustomerSnapshot } from "./invoice/customer-snapshot";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { sendDateWarning } from "./invoice/date-warnings";
  import { parseId } from "./parts/entity/edit-target";
  import { centsToPriceText } from "./parts/entity/format";
  import MailSendButton from "./parts/entity/MailSendButton.svelte";
  import PdfLocation from "./parts/entity/PdfLocation.svelte";
  import { REMINDER_STATUS } from "./parts/entity/status";
  import EditorSaveBar from "./parts/editor/EditorSaveBar.svelte";
  import NoticeCard from "./invoice/NoticeCard.svelte";
  import { createSheetLoader } from "./invoice/detail/sheet-loader.svelte";
  import {
    UNKNOWN_NAME,
    customerNameFromSnapshot,
    parseReminderLevel,
  } from "./parts/reminder/reminder-level";

  type Mode = "new" | "edit";
  let { mode, params }: { mode: Mode; params: Record<string, string> } = $props();

  let loading = $state(true);
  let saving = $state(false);
  let generating = $state(false);
  // The mail program keeps the hand-off call open until its message window is closed.
  let mailing = $state(false);
  let mounted = true;
  onDestroy(() => (mounted = false));
  let error = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);
  let confirmMarkSentAfterMailOpen = $state(false);
  let sendDialogOpen = $state(false);
  let sendDate = $state(toIsoDate(nowUnix()));

  let reminderId = $state<number | null>(null);
  let invoiceId = $state<number | null>(null);
  let invoiceNumber = $state("");
  let customerName = $state("");
  let customerEmail = $state<string | null>(null);

  let level = $state<ReminderLevel>(1);
  let issueIso = $state("");
  let dueIso = $state("");
  let feeStr = $state("");
  let interestStr = $state("");
  let bodyText = $state("");
  let notes = $state("");
  let status = $state<Reminder["status"]>("draft");
  let originalCents = $state(0);
  let currency = $state(DEFAULT_CURRENCY);
  let pdfPath = $state<string | null>(null);
  let loadedOnce = false;

  // The sheet shows the saved state; every save, and marking as sent, asks for a new rendering.
  const sheet = createSheetLoader(renderReminderSheet);
  let sheetVersion = $state(0);

  // Leaving the page with edited fields asks first; the dialog also covers the back link and the sidebar.
  const unsaved = guardUnsavedChanges(
    () => ({ issueIso, dueIso, feeStr, interestStr, bodyText, notes }),
    () => !loading && error === null,
  );

  const readonly = $derived(status !== "draft");
  const feeCents = $derived(eurStringToCents(feeStr));
  const totalDueCents = $derived(originalCents + feeCents + eurStringToCents(interestStr));
  const sendWarning = $derived(
    sendDate ? sendDateWarning(fromIsoDate(sendDate), fromIsoDate(issueIso), nowUnix()) : null,
  );

  $effect(() => {
    init();
  });

  $effect(() => {
    const savedId = reminderId;
    const version = sheetVersion;
    if (savedId !== null) untrack(() => void sheet.load(savedId, String(version)));
  });

  // The router keeps this component mounted when only the parameters change, so a second reminder must not inherit the first one's state.
  async function init() {
    loading = true;
    reminderId = null;
    status = "draft";
    pdfPath = null;
    sheet.clear();
    try {
      if (mode === "new") await loadNewReminder();
      else await loadExistingReminder();
      error = null;
      if (loadedOnce) {
        await tick();
        unsaved.markClean();
      }
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
      loadedOnce = true;
    }
  }

  async function loadNewReminder() {
    const sourceInvoiceId = parseId(params.invoiceId);
    if (sourceInvoiceId === null) throw new Error("Ungültige Rechnungs-ID.");
    const requestedLevel = parseReminderLevel(params.level);
    const draft = await buildReminderDraft(sourceInvoiceId, requestedLevel);
    const source = await getInvoice(sourceInvoiceId);
    if (!source) throw new Error(`Rechnung ${sourceInvoiceId} nicht gefunden.`);
    invoiceId = sourceInvoiceId;
    level = requestedLevel;
    invoiceNumber = source.invoice.number;
    customerName = customerNameFromSnapshot(source.invoice.customerSnapshot);
    customerEmail = await invoiceCustomerEmail(source.invoice);
    originalCents = remindableAmountCents({
      ...source.invoice,
      creditedCent: await loadCreditedCent(sourceInvoiceId),
    });
    currency = source.invoice.currency;
    issueIso = toIsoDate(draft.issueDate);
    dueIso = toIsoDate(draft.dueDate);
    feeStr = centsToPriceText(draft.feeCents);
    interestStr = centsToPriceText(0);
    bodyText = draft.bodyText;
    notes = "";
  }

  async function loadExistingReminder() {
    const existingId = parseId(params.id);
    const reminder = existingId === null ? null : await getReminder(existingId);
    if (!reminder) throw new Error(`Mahnung ${params.id} nicht gefunden.`);
    const snapshot = parseSnapshot<ReminderInvoiceSnapshot>(reminder.invoiceSnapshot, `Mahnungssnapshot ${reminder.number}`);
    reminderId = reminder.id;
    invoiceId = reminder.invoiceId;
    level = reminder.level as ReminderLevel;
    invoiceNumber = snapshot.invoiceNumber ?? UNKNOWN_NAME;
    customerName = snapshot.customerName ?? UNKNOWN_NAME;
    originalCents = reminder.originalTotalCents;
    const invoice = (await getInvoice(reminder.invoiceId))?.invoice;
    currency = invoice?.currency ?? DEFAULT_CURRENCY;
    customerEmail = invoice ? await invoiceCustomerEmail(invoice) : null;
    issueIso = toIsoDate(reminder.issueDate);
    dueIso = toIsoDate(reminder.dueDate);
    feeStr = centsToPriceText(reminder.feeCents);
    interestStr = centsToPriceText(reminder.interestCents);
    bodyText = reminder.bodyText;
    notes = reminder.notes ?? "";
    status = reminder.status;
    pdfPath = reminder.pdfPath;
  }

  function invoiceCustomerEmail(invoice: Invoice): Promise<string | null> {
    const snapshotEmail = parseCustomerSnapshot(invoice.customerSnapshot)?.email ?? null;
    return resolveCustomerEmail(invoice.customerId, snapshotEmail);
  }

  function formFields(): ReminderFields {
    return {
      issueDate: fromIsoDate(issueIso),
      dueDate: fromIsoDate(dueIso),
      feeCents,
      interestCents: eurStringToCents(interestStr),
      bodyText,
      notes: notes.trim() || null,
    };
  }

  /** Creates the reminder on the first save, updates it afterwards. */
  async function save(): Promise<number | null> {
    saving = true;
    try {
      if (reminderId === null) {
        if (invoiceId === null) throw new Error("Rechnung unbekannt.");
        reminderId = await createReminder({ invoiceId, level, ...formFields() });
        toast.success("Mahnung erstellt");
      } else {
        await updateReminder(reminderId, formFields());
        toast.success("Mahnung aktualisiert");
      }
      sheetVersion++;
      unsaved.markClean();
      return reminderId;
    } catch (e) {
      toast.error("Mahnung konnte nicht gespeichert werden", errorMessage(e));
      return null;
    } finally {
      saving = false;
    }
  }

  /** A freshly created reminder gets its own route, so a reload cannot create a duplicate draft. */
  function showSavedReminder(savedId: number) {
    // After a long await (the mail window) the user may have left; do not pull them back.
    if (mounted && mode === "new") replace(`/reminders/${savedId}`);
  }

  async function saveAndStay() {
    const savedId = await save();
    if (savedId !== null) showSavedReminder(savedId);
  }

  async function openPdf(path: string) {
    try {
      await openPath(path);
    } catch (e) {
      toast.error("PDF konnte nicht geöffnet werden", errorMessage(e));
    }
  }

  /** Renders the PDF of a saved reminder and returns its path; null after a reported failure. */
  async function renderPdf(savedId: number): Promise<string | null> {
    generating = true;
    try {
      const res = await generateReminderPdf(savedId);
      if (res.success) {
        pdfPath = res.pdfPath;
        return res.pdfPath;
      }
      if (res.error.code === COMPANY_INCOMPLETE_CODE) notifyCompanyIncomplete(res.error.message);
      else toast.error("PDF konnte nicht erstellt werden", res.error.message);
    } catch (e) {
      toast.error("PDF konnte nicht erstellt werden", errorMessage(e));
    } finally {
      generating = false;
    }
    return null;
  }

  async function generatePdf() {
    const savedId = readonly ? reminderId : await save();
    if (savedId === null) return;
    const path = await renderPdf(savedId);
    if (path) {
      toast.success("PDF erstellt");
      await openPdf(path);
    }
    showSavedReminder(savedId);
  }

  /** A draft gets a fresh PDF, since the form may have changed since the last one. */
  async function sendMail() {
    if (!customerEmail || mailing) return;
    const savedId = readonly ? reminderId : await save();
    if (savedId === null) return;
    const path = readonly && pdfPath ? pdfPath : await renderPdf(savedId);
    const handoff = path ? await handOffMail(path) : null;
    if (!mounted) return;
    if (handoff === "handed-off" && status === "draft") {
      // The route swap waits for the answer: it would discard this dialog.
      confirmMarkSentAfterMailOpen = true;
      return;
    }
    showSavedReminder(savedId);
  }

  async function handOffMail(attachmentPath: string) {
    if (!customerEmail) return null;
    mailing = true;
    try {
      return await sendDocumentByMail(
        "reminder",
        {
          number: invoiceNumber,
          totalCent: totalDueCents,
          currency,
          dueDate: fromIsoDate(dueIso),
          customer: customerName,
        },
        { to: customerEmail, attachmentPath },
      );
    } catch (e) {
      toast.error("E-Mail konnte nicht vorbereitet werden", errorMessage(e));
      return null;
    } finally {
      mailing = false;
    }
  }

  async function markSentAfterMail() {
    sendDate = toIsoDate(nowUnix());
    await confirmSend();
    // A failed confirmSend skips its own route swap, and nothing else would do it now.
    if (status !== "sent") leaveNewRoute();
  }

  /** Any close of the question without marking: the reminder is saved, so the URL must say so. */
  function leaveNewRoute() {
    if (reminderId !== null) showSavedReminder(reminderId);
  }

  function openSendDialog() {
    sendDate = toIsoDate(nowUnix());
    sendDialogOpen = true;
  }

  async function confirmSend() {
    sendDialogOpen = false;
    if (!(await ensureCompanyDataComplete())) return;
    const savedId = await save();
    if (savedId === null) return;
    try {
      await markReminderSent(savedId, fromIsoDate(sendDate));
      status = "sent";
      sheetVersion++;
      toast.success("Als versendet markiert");
      showSavedReminder(savedId);
    } catch (e) {
      toast.error("Mahnung konnte nicht als versendet markiert werden", errorMessage(e));
    }
  }

  async function remove() {
    if (reminderId === null) return;
    try {
      await deleteReminder(reminderId);
      unsaved.markClean();
      toast.success("Mahnung gelöscht");
      push("/reminders");
    } catch (e) {
      toast.error("Mahnung konnte nicht gelöscht werden", errorMessage(e));
    }
  }
</script>

{#snippet headerBadges()}
  <StatusBadge {status} table={REMINDER_STATUS} />
{/snippet}

{#snippet headerSubtitle()}
  zur Rechnung
  {#if invoiceId !== null}
    <a href="/invoices/{invoiceId}" use:link class="font-mono font-semibold text-foreground hover:underline">{invoiceNumber}</a>
  {:else}
    <span class="font-mono">{invoiceNumber}</span>
  {/if}
  {" · " + customerName + (readonly ? " · schreibgeschützt" : "")}
{/snippet}

{#snippet headerActions()}
  <Button variant="outline" onclick={generatePdf} disabled={generating || saving}>
    <FileText />
    {readonly ? "PDF neu erzeugen" : "PDF erzeugen"}
  </Button>
  <MailSendButton email={customerEmail} busy={generating || saving} sending={mailing} onSend={sendMail} />
  {#if reminderId !== null && !readonly}
    <Button variant="outline" onclick={openSendDialog} disabled={saving}>
      <Send />
      Als versendet markieren
    </Button>
    <DropdownMenu>
      {#snippet trigger()}
        <MoreActionsTrigger />
      {/snippet}
      <DropdownItem destructive onSelect={() => (confirmDeleteOpen = true)}>
        <Trash2 />
        Mahnung löschen
      </DropdownItem>
    </DropdownMenu>
  {/if}
{/snippet}

{#if error}
  <PageHeader title="Mahnung" back={{ href: "/reminders", label: "Mahnungen" }} />
  <NoticeCard tone="destructive" title="Die Mahnung lässt sich nicht öffnen">
    <div class="mt-0.5 text-muted-foreground">{error}</div>
  </NoticeCard>
{:else if loading}
  <PageHeader title="Mahnung" back={{ href: "/reminders", label: "Mahnungen" }} />
  <p role="status" class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <PageHeader
    title={levelLabel(level)}
    back={{ href: "/reminders", label: "Mahnungen" }}
    badges={headerBadges}
    subtitle={headerSubtitle}
    actions={headerActions}
    wrap
  />

  <div class="grid items-start gap-7 min-[1321px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
    <div class="min-w-0">
      <FormSection title="Termine" class="border-line-strong">
        <FieldGrid>
          <Field label="Mahnungsdatum">
            <DatePicker bind:value={issueIso} disabled={readonly} />
          </Field>
          <Field label="Neue Zahlungsfrist">
            <DatePicker bind:value={dueIso} disabled={readonly} />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="Beträge" class="border-line-strong">
        <div class="mb-3.5 flex justify-between text-sm">
          <span>Offener Rechnungsbetrag</span>
          <span class="tabular-nums">{formatMoney(originalCents, currency)}</span>
        </div>
        <FieldGrid>
          <Field label="Mahngebühr ({currency})">
            <Input bind:value={feeStr} disabled={readonly} class="text-right tabular-nums" />
          </Field>
          <Field label="Verzugszinsen ({currency})">
            <Input bind:value={interestStr} disabled={readonly} class="text-right tabular-nums" />
          </Field>
        </FieldGrid>
        <div class="mt-3.5 flex justify-between border-t border-line-strong pt-2.5 font-display text-lg font-extrabold">
          <span>Zu zahlender Gesamtbetrag</span>
          <span class="tabular-nums">{formatMoney(totalDueCents, currency)}</span>
        </div>
      </FormSection>

      <FormSection title="Mahntext" class="border-line-strong">
        <Field
          label="Text der Mahnung"
          class="[&>label]:sr-only"
          hint="Erscheint im PDF unter „Sehr geehrte Damen und Herren,“. Vorbefüllt aus den Einstellungen je nach Mahnstufe."
        >
          <Textarea bind:value={bodyText} rows={6} disabled={readonly} />
        </Field>
      </FormSection>

      <FormSection title="Interne Notiz" class="border-line-strong">
        <Field label="Interne Notiz" class="[&>label]:sr-only">
          <Textarea bind:value={notes} rows={3} disabled={readonly} placeholder="Erscheint nicht im PDF" />
        </Field>
      </FormSection>

      {#if pdfPath}
        <PdfLocation path={pdfPath} onOpen={() => openPdf(pdfPath!)} class="mt-6" />
      {/if}

      <p class="mt-6 text-xs text-muted-foreground">
        Hinweis: Diese Mahnung ist eine Zahlungserinnerung und keine Rechtsberatung. Hole für gerichtliche
        Mahnverfahren rechtliche Beratung ein.
      </p>
      <p class="text-xs text-muted-foreground">
        Mahngebühr: {formatMoney(feeCents, currency)} · Fällig: {formatDate(fromIsoDate(dueIso))}
      </p>
    </div>

    <div class="min-w-0 min-[1321px]:sticky min-[1321px]:top-4">
      <h2 class="mb-2 text-base">Vorschau</h2>
      {#if reminderId === null}
        <Card class="gap-1 px-[18px] py-4 text-sm">
          <p class="font-bold">Das Blatt erscheint nach dem Speichern.</p>
          <p class="text-muted-foreground">Die Vorschau zeigt immer den gespeicherten Stand der Mahnung.</p>
        </Card>
      {:else}
        <DocumentSheet html={sheet.html} loading={sheet.loading} error={sheet.error} title="Mahnung {invoiceNumber}" />
        <p class="mt-2 text-xs text-muted-foreground">Gespeicherter Stand. Änderungen erscheinen nach dem Speichern.</p>
      {/if}
    </div>
  </div>

  {#if !readonly}
    <EditorSaveBar
      submitLabel="Speichern"
      {saving}
      onSave={saveAndStay}
      onCancel={() => push("/reminders")}
      total={formatMoney(totalDueCents, currency)}
      totalLabel="Zu zahlen"
    />
  {/if}
{/if}

<DateConfirmDialog
  bind:open={sendDialogOpen}
  bind:date={sendDate}
  title="Als versendet markieren"
  description="Danach ist die Mahnung schreibgeschützt und kann nicht mehr bearbeitet oder gelöscht werden."
  dateInputId="reminder-send-date"
  dateLabel="Versendet am"
  hint="Standard ist heute. Trage für eine Nacherfassung das tatsächliche Datum ein."
  confirmLabel="Als versendet markieren"
  warning={sendWarning}
  onConfirm={confirmSend}
/>

<ConfirmDialog
  bind:open={confirmMarkSentAfterMailOpen}
  title="Als versendet markieren?"
  description="Die Mahnung wurde an dein Mail-Programm übergeben. Danach ist sie schreibgeschützt und kann nicht mehr bearbeitet oder gelöscht werden."
  confirmLabel="Als versendet markieren"
  onConfirm={markSentAfterMail}
  onCancel={leaveNewRoute}
/>

<ConfirmDialog
  bind:open={confirmDeleteOpen}
  title="Mahnung löschen?"
  description="Die Mahnung wird unwiderruflich entfernt."
  confirmLabel="Löschen"
  destructive
  onConfirm={remove}
/>
