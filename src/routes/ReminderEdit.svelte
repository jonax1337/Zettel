<script lang="ts">
  import { push, replace } from "svelte-spa-router";
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
  import type { Reminder, ReminderInvoiceSnapshot, ReminderLevel } from "$lib/db/schema";
  import { parseSnapshot } from "$lib/db/snapshot-json";
  import { fromIsoDate, toIsoDate, formatDate, nowUnix } from "$lib/utils/date";
  import { formatMoney } from "$lib/utils/currency";
  import { eurStringToCents } from "$lib/utils/money";
  import { generateReminderPdf } from "$lib/sidecar/reminder";
  import { COMPANY_INCOMPLETE_CODE } from "$lib/sidecar/company-guard";
  import { ensureCompanyDataComplete, notifyCompanyIncomplete } from "$lib/utils/company-guard";
  import {
    Button,
    ConfirmDialog,
    DatePicker,
    Input,
    Label,
    Textarea,
    toast,
  } from "$lib/ui";
  import { FileText, Send, Trash2 } from "$lib/brand-icons";
  import { openPath } from "@tauri-apps/plugin-opener";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { sendDateWarning } from "./invoice/date-warnings";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { parseId } from "./parts/entity/edit-target";
  import { centsToPriceText } from "./parts/entity/format";
  import PdfLocation from "./parts/entity/PdfLocation.svelte";
  import SectionCard from "./parts/reminder/SectionCard.svelte";
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
  let error = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);
  let sendDialogOpen = $state(false);
  let sendDate = $state(toIsoDate(nowUnix()));

  let reminderId = $state<number | null>(null);
  let invoiceId = $state<number | null>(null);
  let invoiceNumber = $state("");
  let customerName = $state("");

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

  const readonly = $derived(status !== "draft");
  const feeCents = $derived(eurStringToCents(feeStr));
  const totalDueCents = $derived(originalCents + feeCents + eurStringToCents(interestStr));
  const sendWarning = $derived(
    sendDate ? sendDateWarning(fromIsoDate(sendDate), fromIsoDate(issueIso), nowUnix()) : null,
  );

  $effect(() => {
    init();
  });

  async function init() {
    loading = true;
    try {
      if (mode === "new") await loadNewReminder();
      else await loadExistingReminder();
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
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
    level = reminder.level as ReminderLevel;
    invoiceNumber = snapshot.invoiceNumber ?? UNKNOWN_NAME;
    customerName = snapshot.customerName ?? UNKNOWN_NAME;
    originalCents = reminder.originalTotalCents;
    currency = (await getInvoice(reminder.invoiceId))?.invoice.currency ?? DEFAULT_CURRENCY;
    issueIso = toIsoDate(reminder.issueDate);
    dueIso = toIsoDate(reminder.dueDate);
    feeStr = centsToPriceText(reminder.feeCents);
    interestStr = centsToPriceText(reminder.interestCents);
    bodyText = reminder.bodyText;
    notes = reminder.notes ?? "";
    status = reminder.status;
    pdfPath = reminder.pdfPath;
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
      return reminderId;
    } catch (e) {
      toast.error("Mahnung konnte nicht gespeichert werden", String(e));
      return null;
    } finally {
      saving = false;
    }
  }

  /** A freshly created reminder gets its own route, so a reload cannot create a duplicate draft. */
  function showSavedReminder(savedId: number) {
    if (mode === "new") replace(`/reminders/${savedId}`);
  }

  async function saveAndStay() {
    const savedId = await save();
    if (savedId !== null) showSavedReminder(savedId);
  }

  async function openPdf(path: string) {
    try {
      await openPath(path);
    } catch (e) {
      toast.error("PDF konnte nicht geöffnet werden", String(e));
    }
  }

  async function generatePdf() {
    const savedId = readonly ? reminderId : await save();
    if (savedId === null) return;
    generating = true;
    try {
      const res = await generateReminderPdf(savedId);
      if (!res.success) {
        if (res.error.code === COMPANY_INCOMPLETE_CODE) notifyCompanyIncomplete(res.error.message);
        else toast.error("PDF konnte nicht erstellt werden", res.error.message);
      } else {
        pdfPath = res.pdfPath;
        toast.success("PDF erstellt");
        await openPdf(res.pdfPath);
      }
    } catch (e) {
      toast.error("PDF konnte nicht erstellt werden", String(e));
    } finally {
      generating = false;
    }
    showSavedReminder(savedId);
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
      toast.success("Als versendet markiert");
      showSavedReminder(savedId);
    } catch (e) {
      toast.error("Mahnung konnte nicht als versendet markiert werden", String(e));
    }
  }

  async function remove() {
    if (reminderId === null) return;
    try {
      await deleteReminder(reminderId);
      toast.success("Mahnung gelöscht");
      push("/reminders");
    } catch (e) {
      toast.error("Mahnung konnte nicht gelöscht werden", String(e));
    }
  }
</script>

<div class="mb-6">
  <BackLink href="/reminders">Mahnungen</BackLink>
</div>

{#if error}
  <p class="text-sm text-destructive">Fehler: {error}</p>
{:else if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <header class="mb-6 flex items-end justify-between gap-4">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight">
        {levelLabel(level)}
      </h1>
      <p class="text-sm text-muted-foreground mt-1">
        zur Rechnung <span class="font-mono">{invoiceNumber}</span> · {customerName}
      </p>
    </div>
    {#if readonly}
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted-foreground">Versendet — schreibgeschützt</span>
        <Button variant="outline" onclick={generatePdf} disabled={generating}>
          <FileText class="size-4" />
          PDF neu erzeugen
        </Button>
      </div>
    {:else}
      <div class="flex gap-2">
        <Button variant="outline" onclick={saveAndStay} disabled={saving}>
          Speichern
        </Button>
        <Button onclick={generatePdf} disabled={generating || saving}>
          <FileText class="size-4" />
          PDF erzeugen
        </Button>
      </div>
    {/if}
  </header>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
    <SectionCard title="Termine">
      <div class="flex flex-col gap-1.5">
        <Label>Mahnungsdatum</Label>
        <DatePicker bind:value={issueIso} disabled={readonly} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>Neue Zahlungsfrist</Label>
        <DatePicker bind:value={dueIso} disabled={readonly} />
      </div>
    </SectionCard>

    <SectionCard title="Beträge">
      <div class="flex justify-between text-sm">
        <span>Offener Rechnungsbetrag</span>
        <span class="font-mono">{formatMoney(originalCents, currency)}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>Mahngebühr ({currency})</Label>
        <Input bind:value={feeStr} disabled={readonly} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label>Verzugszinsen ({currency})</Label>
        <Input bind:value={interestStr} disabled={readonly} />
      </div>
      <div class="flex justify-between text-base font-semibold border-t pt-2">
        <span>Zu zahlender Gesamtbetrag</span>
        <span class="font-mono">{formatMoney(totalDueCents, currency)}</span>
      </div>
    </SectionCard>
  </div>

  <SectionCard title="Mahntext" class="mb-4">
    <Textarea bind:value={bodyText} rows={6} disabled={readonly} />
    <p class="text-xs text-muted-foreground">
      Erscheint im PDF unter „Sehr geehrte Damen und Herren,". Vorbefüllt aus den Einstellungen je nach Mahnstufe.
    </p>
  </SectionCard>

  <SectionCard title="Interne Notiz" class="mb-4">
    <Textarea bind:value={notes} rows={3} disabled={readonly} placeholder="Erscheint nicht im PDF" />
  </SectionCard>

  {#if pdfPath}
    <PdfLocation path={pdfPath} onOpen={() => openPdf(pdfPath!)} />
  {/if}

  {#if reminderId !== null && !readonly}
    <div class="flex justify-between items-center pt-4 border-t">
      <Button variant="ghost" size="sm" onclick={() => (confirmDeleteOpen = true)}>
        <Trash2 class="size-4" />
        Löschen
      </Button>
      <Button variant="outline" onclick={openSendDialog} disabled={saving}>
        <Send class="size-4" />
        Als versendet markieren
      </Button>
    </div>
  {/if}

  <div class="mt-6 text-xs text-muted-foreground">
    <p>
      Hinweis: Diese Mahnung ist eine Zahlungserinnerung — keine Rechtsberatung. Für gerichtliche Mahnverfahren bitte rechtliche Beratung einholen.
    </p>
    <p class="mt-1">
      Mahngebühr: {formatMoney(feeCents, currency)} · Fällig: {formatDate(fromIsoDate(dueIso))}
    </p>
  </div>
{/if}

<DateConfirmDialog
  bind:open={sendDialogOpen}
  bind:date={sendDate}
  title="Als versendet markieren"
  description="Danach ist die Mahnung schreibgeschützt und kann nicht mehr bearbeitet oder gelöscht werden."
  dateInputId="reminder-send-date"
  dateLabel="Versendet am"
  hint="Standard ist heute. Für Nacherfassung das tatsächliche Datum eintragen."
  confirmLabel="Als versendet markieren"
  warning={sendWarning}
  onConfirm={confirmSend}
/>

<ConfirmDialog
  bind:open={confirmDeleteOpen}
  title="Mahnung löschen?"
  description="Die Mahnung wird unwiderruflich entfernt."
  confirmLabel="Löschen"
  destructive
  onConfirm={remove}
/>
