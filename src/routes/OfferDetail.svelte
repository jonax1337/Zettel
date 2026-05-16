<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import {
    convertToInvoice,
    deleteOffer,
    getOffer,
    markAccepted,
    markRejected,
    markSent,
    reopenDraft,
  } from "$lib/db/offers";
  import { getInvoice } from "$lib/db/invoices";
  import type {
    CustomerSnapshot,
    Offer,
    OfferItem,
    OfferStatus,
  } from "$lib/db/schema";
  import { centsToEur } from "$lib/utils/money";
  import { formatDate } from "$lib/utils/date";
  import { generateOfferPdf } from "$lib/sidecar/offer";
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
  import {
    ArrowLeft,
    FileDown,
    FileText,
    FolderOpen,
    Pencil,
    Send,
    CheckCircle2,
    XCircle,
    Undo2,
    Trash2,
    MoreHorizontal,
    AlertTriangle,
    FileSignature,
  } from "@lucide/svelte";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let offer = $state<Offer | null>(null);
  let items = $state<OfferItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let generating = $state(false);
  let converting = $state(false);
  let lastPdfPath = $state<string | null>(null);
  let pdfError = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);
  let convertedInvoiceNumber = $state<string | null>(null);

  const customer = $derived.by(() => {
    if (!offer) return null;
    try {
      return JSON.parse(offer.customerSnapshot) as CustomerSnapshot;
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
      const res = await getOffer(numId);
      if (!res) {
        error = "Angebot nicht gefunden.";
        return;
      }
      offer = res.offer;
      items = res.items;
      lastPdfPath = res.offer.pdfPath;
      convertedInvoiceNumber = null;
      if (res.offer.convertedInvoiceId) {
        try {
          const inv = await getInvoice(res.offer.convertedInvoiceId);
          convertedInvoiceNumber = inv?.invoice.number ?? null;
        } catch {
          convertedInvoiceNumber = null;
        }
      }
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
    if (!offer) return;
    try {
      await deleteOffer(offer.id);
      toast.success("Angebot gelöscht");
      push("/offers");
    } catch (e) {
      toast.error("Löschen fehlgeschlagen", String(e));
    }
  }

  async function onGeneratePdf() {
    if (!offer) return;
    generating = true;
    pdfError = null;
    try {
      const res = await generateOfferPdf(offer.id);
      if (res.success) {
        lastPdfPath = res.pdfPath;
        toast.success("PDF erstellt");
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

  async function onConvert() {
    if (!offer) return;
    converting = true;
    try {
      const newId = await convertToInvoice(offer.id);
      const inv = await getInvoice(newId);
      const number = inv?.invoice.number ?? `#${newId}`;
      toast.success(`Rechnung ${number} erstellt — bitte Daten prüfen`);
      push(`/invoices/${newId}/edit`);
    } catch (e) {
      toast.error("Umwandlung fehlgeschlagen", String(e));
    } finally {
      converting = false;
    }
  }

  const statusLabel: Record<OfferStatus, string> = {
    draft: "Entwurf",
    sent: "Versendet",
    accepted: "Angenommen",
    rejected: "Abgelehnt",
    expired: "Abgelaufen",
  };

  const statusVariant: Record<
    OfferStatus,
    "secondary" | "warning" | "success" | "destructive" | "outline"
  > = {
    draft: "secondary",
    sent: "warning",
    accepted: "success",
    rejected: "destructive",
    expired: "outline",
  };
</script>

<header class="mb-6">
  <a
    href="/offers"
    use:link
    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft class="size-4" /> Angebote
  </a>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error && !offer}
  <p class="text-sm text-destructive">{error}</p>
{:else if offer && customer}
  <div class="flex items-start justify-between gap-4 mb-6">
    <div>
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-semibold tracking-tight font-mono">{offer.number}</h1>
        <Badge variant={statusVariant[offer.status]}>{statusLabel[offer.status]}</Badge>
      </div>
      <p class="text-sm text-muted-foreground mt-1.5">
        {customer.name} · {formatDate(offer.issueDate)}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if offer.status === "accepted" && !offer.convertedInvoiceId}
        <Button disabled={converting} onclick={onConvert}>
          <FileSignature />
          {converting ? "Erzeuge…" : "In Rechnung umwandeln"}
        </Button>
      {/if}

      <Button disabled={generating} onclick={onGeneratePdf} variant={offer.status === "accepted" && !offer.convertedInvoiceId ? "outline" : "default"}>
        <FileDown />
        {generating ? "Erzeuge…" : lastPdfPath ? "PDF neu erzeugen" : "PDF erzeugen"}
      </Button>

      {#if lastPdfPath}
        <Button variant="outline" onclick={onOpenExisting}>
          <FileText />
          Öffnen
        </Button>
        <Button variant="outline" size="icon" onclick={onRevealInExplorer} aria-label="Im Explorer zeigen">
          <FolderOpen />
        </Button>
      {/if}

      {#if offer.status === "draft"}
        <Button
          variant="outline"
          onclick={() => push(`/offers/${offer!.id}/edit`)}
        >
          <Pencil />
          Bearbeiten
        </Button>
        <Button disabled={busy} onclick={() => action("Als versendet markiert", () => markSent(offer!.id))}>
          <Send />
          Versenden
        </Button>
      {/if}
      {#if offer.status === "sent"}
        <Button disabled={busy} onclick={() => action("Als angenommen markiert", () => markAccepted(offer!.id))}>
          <CheckCircle2 />
          Angenommen
        </Button>
        <Button variant="outline" disabled={busy} onclick={() => action("Als abgelehnt markiert", () => markRejected(offer!.id))}>
          <XCircle />
          Abgelehnt
        </Button>
      {/if}

      <DropdownMenu>
        {#snippet trigger()}
          <button
            type="button"
            class="inline-flex items-center justify-center size-9 rounded-md border border-border hover:bg-accent transition-colors"
            aria-label="Weitere Aktionen"
          >
            <MoreHorizontal class="size-4" />
          </button>
        {/snippet}

        {#if offer.status === "sent" || offer.status === "rejected" || offer.status === "expired"}
          <DropdownItem onSelect={() => action("Zurück zu Entwurf", () => reopenDraft(offer!.id))}>
            <Undo2 /> Zurück zu Entwurf
          </DropdownItem>
        {/if}
        {#if offer.status === "draft" || offer.status === "rejected" || offer.status === "expired"}
          <DropdownSeparator />
          <DropdownItem destructive onSelect={() => (confirmDeleteOpen = true)}>
            <Trash2 /> Löschen
          </DropdownItem>
        {/if}
      </DropdownMenu>
    </div>
  </div>

  {#if offer.status === "accepted" && offer.convertedInvoiceId}
    <Card class="border-success/40 bg-success/5 mb-4">
      <CardContent>
        <div class="flex items-center gap-3 text-sm">
          <CheckCircle2 class="size-5 text-success shrink-0" />
          <div class="flex-1">
            Umgewandelt in Rechnung
            <a
              href={`/invoices/${offer.convertedInvoiceId}`}
              use:link
              class="font-mono font-medium text-foreground hover:underline"
            >
              {convertedInvoiceNumber ?? `#${offer.convertedInvoiceId}`}
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  {/if}

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
    <p class="text-xs text-muted-foreground mb-4 font-mono">PDF: {lastPdfPath}</p>
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
          <dt class="text-muted-foreground">Angebotsdatum</dt>
          <dd>{formatDate(offer.issueDate)}</dd>
          <dt class="text-muted-foreground">Gültig bis</dt>
          <dd>{formatDate(offer.validUntil)}</dd>
          {#if offer.sentAt}
            <dt class="text-muted-foreground">Versendet</dt>
            <dd>{formatDate(offer.sentAt)}</dd>
          {/if}
          {#if offer.acceptedAt}
            <dt class="text-muted-foreground">Angenommen</dt>
            <dd>{formatDate(offer.acceptedAt)}</dd>
          {/if}
          {#if offer.rejectedAt}
            <dt class="text-muted-foreground">Abgelehnt</dt>
            <dd>{formatDate(offer.rejectedAt)}</dd>
          {/if}
        </dl>
      </CardContent>
    </Card>
  </div>

  {#if offer.introText}
    <section class="mb-4">
      <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">
        Einleitung
      </h3>
      <p class="text-sm whitespace-pre-line">{offer.introText}</p>
    </section>
  {/if}

  <Card class="overflow-hidden mb-6">
    <table class="w-full text-sm">
      <thead class="bg-muted/40 text-left">
        <tr class="text-xs uppercase tracking-wider text-muted-foreground">
          <th class="px-4 py-3 font-medium w-12">#</th>
          <th class="px-4 py-3 font-medium">Beschreibung</th>
          <th class="px-4 py-3 font-medium text-right w-20">Menge</th>
          <th class="px-4 py-3 font-medium w-20">Einheit</th>
          <th class="px-4 py-3 font-medium text-right w-28">Preis</th>
          {#if !offer.isKleinunternehmer}
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
            {#if !offer.isKleinunternehmer}
              <td class="px-4 py-3 text-right">{it.vatRate}</td>
            {/if}
            <td class="px-4 py-3 text-right font-mono">{centsToEur(it.lineTotal)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="bg-muted/40">
        <tr class="border-t border-border">
          <td colspan={offer.isKleinunternehmer ? 5 : 6} class="px-4 py-2 text-right text-muted-foreground">
            Zwischensumme
          </td>
          <td class="px-4 py-2 text-right font-mono">{centsToEur(offer.subtotal)}</td>
        </tr>
        {#if !offer.isKleinunternehmer}
          <tr>
            <td colspan="6" class="px-4 py-2 text-right text-muted-foreground">USt</td>
            <td class="px-4 py-2 text-right font-mono">{centsToEur(offer.vatAmount)}</td>
          </tr>
        {/if}
        <tr class="border-t border-border">
          <td colspan={offer.isKleinunternehmer ? 5 : 6} class="px-4 py-3 text-right font-semibold">
            Gesamtbetrag
          </td>
          <td class="px-4 py-3 text-right font-mono font-semibold">{centsToEur(offer.total)}</td>
        </tr>
      </tfoot>
    </table>
  </Card>

  {#if offer.notes}
    <section class="mb-4">
      <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">
        Notizen
      </h3>
      <p class="text-sm whitespace-pre-line">{offer.notes}</p>
    </section>
  {/if}

  <ConfirmDialog
    bind:open={confirmDeleteOpen}
    title="Angebot löschen?"
    description={offer ? `${offer.number} wird unwiderruflich entfernt.` : ""}
    confirmLabel="Löschen"
    destructive
    onConfirm={performDelete}
  />
{/if}
