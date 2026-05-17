<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    cancelInvoice,
    createCreditNoteFromInvoice,
    deleteInvoice,
    findCreditNoteFor,
    getInvoice,
    markPaid,
    markSent,
    reopenDraft,
  } from "$lib/db/invoices";
  import type {
    CustomerSnapshot,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
  } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { generateInvoicePdf } from "$lib/sidecar/invoice";
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
  import {
    Button,
    Card,
    CardContent,
    Badge,
    ConfirmDialog,
    DropdownMenu,
    DropdownItem,
    DropdownSeparator,
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
    AlertTriangle,
    Repeat,
    FileWarning,
    ShieldCheck,
    ChevronDown,
    Loader2,
  } from "@lucide/svelte";
  import { execute } from "$lib/db/client";
  import { validatePdf } from "$lib/validator";
  import { listRemindersForInvoice } from "$lib/db/reminders";
  import type { ReminderLevel } from "$lib/db/schema";
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
  let pdfError = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);
  let confirmCreditNoteOpen = $state(false);
  let creatingCreditNote = $state(false);
  let revalidating = $state(false);

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
        if (res.kositReport && !res.kositReport.valid) {
          toast.warning(
            `PDF erstellt — KoSIT-Validierung schlug fehl (${res.kositReport.findings.length} Findings)`,
            "Details unter /validate. Versand erst nach Korrektur empfohlen.",
          );
        } else if (res.kositReport?.valid) {
          toast.success("PDF erstellt · ZUGFeRD-konform (KoSIT)");
        } else {
          toast.success("PDF erstellt");
        }
        await openPath(res.pdfPath);
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
    paid: "Bezahlt",
    cancelled: "Storniert",
  };

  const statusVariant: Record<InvoiceStatus, "secondary" | "warning" | "success" | "outline"> = {
    draft: "secondary",
    sent: "warning",
    paid: "success",
    cancelled: "outline",
  };

  const canCreateCreditNote = $derived(
    !!invoice &&
      !invoice.isCreditNote &&
      (invoice.status === "sent" || invoice.status === "paid") &&
      !cancelledByCreditNote,
  );

  let existingReminderLevels = $state<ReminderLevel[]>([]);
  $effect(() => {
    if (invoice && !invoice.isCreditNote) {
      listRemindersForInvoice(invoice.id)
        .then((list) => {
          existingReminderLevels = list
            .map((r) => r.level)
            .filter((l): l is ReminderLevel => l === 1 || l === 2 || l === 3);
        })
        .catch(() => {
          existingReminderLevels = [];
        });
    } else {
      existingReminderLevels = [];
    }
  });

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
    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4" /> Rechnungen
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

  <div class="mb-6">
    <h1 class="text-3xl font-semibold tracking-tight font-mono">
      {invoice.isCreditNote ? "Storno " : ""}{invoice.number}
    </h1>
    <p class="text-sm text-muted-foreground mt-1.5">
      {customer.name} · {formatDate(invoice.issueDate)}
    </p>
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

  <div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
   <div class="min-w-0">
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
          {#if invoice.deliveryDate}
            <dt class="text-muted-foreground">Lieferdatum</dt>
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
            <td class="px-4 py-3 text-xs text-muted-foreground">{it.position}</td>
            <td class="px-4 py-3">{it.description}</td>
            <td class="px-4 py-3 text-right">{it.quantity}</td>
            <td class="px-4 py-3">{it.unit}</td>
            <td class="px-4 py-3 text-right font-mono">{centsToEur(it.unitPrice)}</td>
            {#if !invoice.isKleinunternehmer}
              <td class="px-4 py-3 text-right">{it.vatRate}</td>
            {/if}
            <td class="px-4 py-3 text-right font-mono">{centsToEur(it.lineTotal)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="bg-muted/40">
        <tr class="border-t border-border">
          <td colspan={invoice.isKleinunternehmer ? 5 : 6} class="px-4 py-2 text-right text-muted-foreground">
            Zwischensumme
          </td>
          <td class="px-4 py-2 text-right font-mono">{centsToEur(invoice.subtotal)}</td>
        </tr>
        {#if !invoice.isKleinunternehmer}
          <tr>
            <td colspan="6" class="px-4 py-2 text-right text-muted-foreground">USt</td>
            <td class="px-4 py-2 text-right font-mono">{centsToEur(invoice.vatAmount)}</td>
          </tr>
        {/if}
        <tr class="border-t border-border">
          <td colspan={invoice.isKleinunternehmer ? 5 : 6} class="px-4 py-3 text-right font-semibold">
            Gesamtbetrag
          </td>
          <td class="px-4 py-3 text-right font-mono font-semibold">{centsToEur(invoice.total)}</td>
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
        Notizen
      </h3>
      <p class="text-sm whitespace-pre-line">{invoice.notes}</p>
    </section>
  {/if}
   </div>

   <aside class="space-y-5 lg:sticky lg:top-4 lg:self-start">
      <section>
        <h3 class="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-2">
          Status
        </h3>
        <DropdownMenu>
          {#snippet trigger()}
            <button
              type="button"
              disabled={busy || invoice!.status === "paid" || invoice!.status === "cancelled"}
              class="w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 h-9 text-sm hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span class="inline-flex items-center gap-2">
                <Badge variant={statusVariant[invoice!.status]}>{statusLabel[invoice!.status]}</Badge>
                {#if invoice!.isCreditNote}
                  <Badge variant="destructive" class="text-[10px]">Storno</Badge>
                {/if}
              </span>
              <ChevronDown class="size-4 text-muted-foreground" />
            </button>
          {/snippet}
          {#if invoice.status === "draft"}
            <DropdownItem onSelect={() => action("Als versendet markiert", () => markSent(invoice!.id))}>
              <Send /> Als versendet markieren
            </DropdownItem>
            <DropdownItem onSelect={() => action("Storniert", () => cancelInvoice(invoice!.id))}>
              <Ban /> Stornieren
            </DropdownItem>
          {:else if invoice.status === "sent"}
            <DropdownItem onSelect={() => action("Als bezahlt markiert", () => markPaid(invoice!.id))}>
              <CheckCircle2 /> Als bezahlt markieren
            </DropdownItem>
            <DropdownItem onSelect={() => action("Zurück zu Entwurf", () => reopenDraft(invoice!.id))}>
              <Undo2 /> Zurück zu Entwurf
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={() => action("Storniert", () => cancelInvoice(invoice!.id))}>
              <Ban /> Stornieren
            </DropdownItem>
          {/if}
        </DropdownMenu>
      </section>

      {#if invoice.lastValidationStatus || lastPdfPath}
        <section>
          <h3 class="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-2">
            Validierung
          </h3>
          <div class="space-y-2">
            <ValidationBadge
              status={invoice.lastValidationStatus}
              findingsCount={invoice.lastValidationFindingsCount}
            />
            {#if invoice.lastValidatedAt}
              <p class="text-[11px] text-muted-foreground">
                {new Date(invoice.lastValidatedAt * 1000).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            {/if}
            {#if lastPdfPath}
              <Button
                variant="outline"
                size="sm"
                class="w-full"
                onclick={onRevalidate}
                disabled={revalidating}
              >
                {#if revalidating}<Loader2 class="animate-spin" />{:else}<ShieldCheck />{/if}
                {revalidating ? "Prüfe…" : "Erneut prüfen"}
              </Button>
            {/if}
          </div>
        </section>
      {/if}

      <section>
        <h3 class="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-2">
          PDF
        </h3>
        <div class="space-y-2">
          {#if lastPdfPath}
            <p class="text-[11px] text-muted-foreground font-mono break-all line-clamp-2" title={lastPdfPath}>
              {lastPdfPath.split(/[\\/]/).pop()}
            </p>
            <Button variant="default" size="sm" class="w-full" onclick={onOpenExisting}>
              <FileText /> Öffnen
            </Button>
            <Button variant="outline" size="sm" class="w-full" onclick={onGeneratePdf} disabled={generating}>
              {#if generating}<Loader2 class="animate-spin" />{:else}<FileDown />{/if}
              {generating ? "Erzeuge…" : "Neu erzeugen"}
            </Button>
            <Button variant="outline" size="sm" class="w-full" onclick={onRevealInExplorer}>
              <FolderOpen /> Im Explorer
            </Button>
          {:else}
            <Button class="w-full" onclick={onGeneratePdf} disabled={generating}>
              {#if generating}<Loader2 class="animate-spin" />{:else}<FileDown />{/if}
              {generating ? "Erzeuge…" : "PDF erzeugen"}
            </Button>
          {/if}
        </div>
      </section>

      {#if invoice.status === "draft" || canCreateReminder || canCreateCreditNote || !invoice.isCreditNote}
        <section>
          <h3 class="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider mb-2">
            Aktionen
          </h3>
          <div class="space-y-2">
            {#if invoice.status === "draft"}
              <Button
                variant="outline"
                size="sm"
                class="w-full"
                onclick={() => push(`/invoices/${invoice!.id}/edit`)}
              >
                <Pencil /> Bearbeiten
              </Button>
            {/if}
            {#if canCreateReminder}
              <Button
                variant="outline"
                size="sm"
                class="w-full"
                onclick={() => push(`/reminders/new/${invoice!.id}/${nextReminderLevel}`)}
              >
                <FileWarning />
                {nextReminderLevel === 1
                  ? "Erinnerung"
                  : nextReminderLevel === 2
                    ? "Mahnung"
                    : "Letzte Mahnung"}
              </Button>
            {/if}
            {#if canCreateCreditNote}
              <Button
                variant="outline"
                size="sm"
                class="w-full"
                disabled={creatingCreditNote}
                onclick={() => (confirmCreditNoteOpen = true)}
              >
                <Ban /> Stornorechnung
              </Button>
            {/if}
            {#if !invoice.isCreditNote}
              <Button
                variant="outline"
                size="sm"
                class="w-full"
                onclick={() => push(`/recurring/new?fromInvoice=${invoice!.id}`)}
              >
                <Repeat /> Als Vorlage
              </Button>
            {/if}
            {#if invoice.status === "draft" || invoice.status === "cancelled"}
              <Button
                variant="outline"
                size="sm"
                class="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onclick={() => (confirmDeleteOpen = true)}
              >
                <Trash2 /> Löschen
              </Button>
            {/if}
          </div>
        </section>
      {/if}
    </aside>
  </div>

  <ConfirmDialog
    bind:open={confirmDeleteOpen}
    title="Rechnung löschen?"
    description={invoice ? `${invoice.number} wird unwiderruflich entfernt.` : ""}
    confirmLabel="Löschen"
    destructive
    onConfirm={performDelete}
  />

  <ConfirmDialog
    bind:open={confirmCreditNoteOpen}
    title="Stornorechnung erstellen?"
    description={invoice
      ? `Erstellt einen Entwurf, der ${invoice.number} vollständig storniert. Mengen lassen sich anschließend für Teilstornos anpassen.`
      : ""}
    confirmLabel="Erstellen"
    destructive
    onConfirm={performCreateCreditNote}
  />
{/if}
