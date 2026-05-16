<script lang="ts">
  import { push } from "svelte-spa-router";
  import {
    buildReminderDraft,
    createReminder,
    deleteReminder,
    getReminder,
    levelLabel,
    markReminderSent,
    updateReminder,
    type ReminderDraft,
  } from "$lib/db/reminders";
  import { getInvoice } from "$lib/db/invoices";
  import type {
    Reminder,
    ReminderInvoiceSnapshot,
    ReminderLevel,
  } from "$lib/db/schema";
  import { fromIsoDate, toIsoDate, formatDate } from "$lib/utils/date";
  import { centsToEur, eurStringToCents } from "$lib/utils/money";
  import { generateReminderPdf } from "$lib/sidecar/reminder";
  import { Button, Card, Input, Label, Textarea, toast } from "$lib/ui";
  import { ArrowLeft, FileText, Send, Trash2 } from "@lucide/svelte";
  import { open as openShell } from "@tauri-apps/plugin-shell";

  type Mode = "new" | "edit";
  let { mode, params }: { mode: Mode; params: Record<string, string> } = $props();

  let loading = $state(true);
  let saving = $state(false);
  let generating = $state(false);
  let error = $state<string | null>(null);

  let reminderId = $state<number | null>(null);
  let invoiceNumber = $state("");
  let customerName = $state("");

  let level = $state<ReminderLevel>(1);
  let issueIso = $state(toIsoDate(Math.floor(Date.now() / 1000)));
  let dueIso = $state(toIsoDate(Math.floor(Date.now() / 1000) + 14 * 86400));
  let feeStr = $state("0,00");
  let interestStr = $state("0,00");
  let bodyText = $state("");
  let notes = $state("");
  let status = $state<Reminder["status"]>("draft");
  let originalCents = $state(0);
  let pdfPath = $state<string | null>(null);

  const totalDueCents = $derived(
    originalCents + eurStringToCents(feeStr) + eurStringToCents(interestStr),
  );

  $effect(() => {
    init();
  });

  async function init() {
    loading = true;
    try {
      if (mode === "new") {
        const invoiceId = Number.parseInt(params.invoiceId, 10);
        const lvlParam = Number.parseInt(params.level ?? "1", 10);
        const lvl: ReminderLevel = (lvlParam === 2 || lvlParam === 3 ? lvlParam : 1) as ReminderLevel;
        const draft = await buildReminderDraft(invoiceId, lvl);
        const data = await getInvoice(invoiceId);
        if (!data) throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
        let snapName = "—";
        try {
          snapName = JSON.parse(data.invoice.customerSnapshot)?.name ?? "—";
        } catch {
          /* default */
        }
        level = lvl;
        invoiceNumber = data.invoice.number;
        customerName = snapName;
        originalCents = data.invoice.total;
        issueIso = toIsoDate(draft.issueDate);
        dueIso = toIsoDate(draft.dueDate);
        feeStr = (draft.feeCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
        interestStr = "0,00";
        bodyText = draft.bodyText;
        notes = "";
      } else {
        const id = Number.parseInt(params.id, 10);
        const r = await getReminder(id);
        if (!r) throw new Error(`Mahnung ${id} nicht gefunden.`);
        reminderId = r.id;
        level = r.level as ReminderLevel;
        let snap: ReminderInvoiceSnapshot | null = null;
        try {
          snap = JSON.parse(r.invoiceSnapshot);
        } catch {
          snap = null;
        }
        invoiceNumber = snap?.invoiceNumber ?? "—";
        customerName = snap?.customerName ?? "—";
        originalCents = r.originalTotalCents;
        issueIso = toIsoDate(r.issueDate);
        dueIso = toIsoDate(r.dueDate);
        feeStr = (r.feeCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
        interestStr = (r.interestCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 });
        bodyText = r.bodyText;
        notes = r.notes ?? "";
        status = r.status;
        pdfPath = r.pdfPath;
      }
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function save(): Promise<number | null> {
    saving = true;
    try {
      const issueDate = fromIsoDate(issueIso);
      const dueDate = fromIsoDate(dueIso);
      const feeCents = eurStringToCents(feeStr);
      const interestCents = eurStringToCents(interestStr);
      if (mode === "new") {
        const draft: ReminderDraft = {
          invoiceId: Number.parseInt(params.invoiceId, 10),
          level,
          issueDate,
          dueDate,
          feeCents,
          interestCents,
          bodyText,
          notes: notes.trim() || null,
        };
        const id = await createReminder(draft);
        reminderId = id;
        toast.success("Mahnung erstellt");
        return id;
      }
      if (reminderId == null) return null;
      await updateReminder(reminderId, {
        issueDate,
        dueDate,
        feeCents,
        interestCents,
        bodyText,
        notes: notes.trim() || null,
      });
      toast.success("Mahnung aktualisiert");
      return reminderId;
    } catch (e) {
      toast.error(String(e));
      return null;
    } finally {
      saving = false;
    }
  }

  async function saveAndStay() {
    const id = await save();
    if (id != null && mode === "new") {
      push(`/reminders/${id}`);
    }
  }

  async function generatePdf() {
    if (reminderId == null) {
      const id = await save();
      if (id == null) return;
    }
    if (reminderId == null) return;
    generating = true;
    try {
      const res = await generateReminderPdf(reminderId);
      if (res.success) {
        pdfPath = res.pdfPath;
        toast.success("PDF erstellt");
        await openShell(res.pdfPath);
      } else {
        toast.error(`PDF fehlgeschlagen: ${res.error.message}`);
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      generating = false;
    }
  }

  async function markSent() {
    if (reminderId == null) return;
    try {
      await markReminderSent(reminderId);
      status = "sent";
      toast.success("Als versendet markiert");
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function remove() {
    if (reminderId == null) return;
    if (!confirm("Mahnung wirklich löschen?")) return;
    try {
      await deleteReminder(reminderId);
      toast.success("Mahnung gelöscht");
      push("/reminders");
    } catch (e) {
      toast.error(String(e));
    }
  }
</script>

<div class="mb-6">
  <Button variant="ghost" size="sm" onclick={() => push("/reminders")}>
    <ArrowLeft class="size-4" />
    Zurück
  </Button>
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
    {#if status === "draft"}
      <div class="flex gap-2">
        <Button variant="outline" onclick={saveAndStay} disabled={saving}>
          Speichern
        </Button>
        <Button onclick={generatePdf} disabled={generating || saving}>
          <FileText class="size-4" />
          PDF erzeugen
        </Button>
      </div>
    {:else}
      <span class="text-sm text-muted-foreground">Versendet — schreibgeschützt</span>
    {/if}
  </header>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
    <Card>
      <div class="p-5 flex flex-col gap-4">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Termine
        </h3>
        <div class="flex flex-col gap-1.5">
          <Label>Mahnungsdatum</Label>
          <Input type="date" bind:value={issueIso} disabled={status !== "draft"} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Neue Zahlungsfrist</Label>
          <Input type="date" bind:value={dueIso} disabled={status !== "draft"} />
        </div>
      </div>
    </Card>

    <Card>
      <div class="p-5 flex flex-col gap-4">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Beträge
        </h3>
        <div class="flex justify-between text-sm">
          <span>Rechnungsbetrag</span>
          <span class="font-mono">{centsToEur(originalCents)}</span>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Mahngebühr (EUR)</Label>
          <Input bind:value={feeStr} disabled={status !== "draft"} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Verzugszinsen (EUR)</Label>
          <Input bind:value={interestStr} disabled={status !== "draft"} />
        </div>
        <div class="flex justify-between text-base font-semibold border-t pt-2">
          <span>Zu zahlender Gesamtbetrag</span>
          <span class="font-mono">{centsToEur(totalDueCents)}</span>
        </div>
      </div>
    </Card>
  </div>

  <Card class="mb-4">
    <div class="p-5 flex flex-col gap-4">
      <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Mahntext
      </h3>
      <Textarea bind:value={bodyText} rows={6} disabled={status !== "draft"} />
      <p class="text-xs text-muted-foreground">
        Erscheint im PDF unter „Sehr geehrte Damen und Herren,". Vorbefüllt aus den Einstellungen je nach Mahnstufe.
      </p>
    </div>
  </Card>

  <Card class="mb-4">
    <div class="p-5 flex flex-col gap-4">
      <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Interne Notiz
      </h3>
      <Textarea bind:value={notes} rows={3} disabled={status !== "draft"} placeholder="Erscheint nicht im PDF" />
    </div>
  </Card>

  {#if pdfPath}
    <Card class="mb-4">
      <div class="p-5 flex items-center justify-between gap-4">
        <div class="text-sm">
          <div class="font-medium">PDF</div>
          <div class="text-xs text-muted-foreground font-mono">{pdfPath}</div>
        </div>
        <Button variant="outline" size="sm" onclick={() => pdfPath && openShell(pdfPath)}>
          Öffnen
        </Button>
      </div>
    </Card>
  {/if}

  {#if reminderId != null && status === "draft"}
    <div class="flex justify-between items-center pt-4 border-t">
      <Button variant="ghost" size="sm" onclick={remove}>
        <Trash2 class="size-4" />
        Löschen
      </Button>
      <Button variant="outline" onclick={markSent}>
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
      Mahngebühr: {centsToEur(eurStringToCents(feeStr))} · Fällig: {formatDate(fromIsoDate(dueIso))}
    </p>
  </div>
{/if}
