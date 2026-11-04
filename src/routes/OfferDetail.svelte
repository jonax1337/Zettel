<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
  import {
    convertToInvoice,
    deleteOffer,
    getOffer,
    markAccepted,
    markRejected,
    markSent,
    reopenDraft,
  } from "$lib/db/offers";
  import { displayInvoiceNumber, getInvoice } from "$lib/db/invoices";
  import type { Offer, OfferItem } from "$lib/db/schema";
  import { formatDate, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { SUPPLY_KIND_LABEL } from "./invoice/supply-kind";
  import { generateOfferPdf } from "$lib/sidecar/offer";
  import {
    Badge,
    Button,
    Card,
    CardContent,
    ConfirmDialog,
    DropdownItem,
    DropdownMenu,
    DropdownSeparator,
    toast,
  } from "$lib/ui";
  import {
    CheckCircle2,
    FileDown,
    FileSignature,
    FileText,
    FolderOpen,
    MoreHorizontal,
    Pencil,
    Send,
    Trash2,
    Undo2,
    XCircle,
  } from "$lib/brand-icons";
  import { parseCustomerSnapshot, UNREADABLE_SNAPSHOT_MESSAGE } from "./invoice/customer-snapshot";
  import CustomerSnapshotCard from "./invoice/CustomerSnapshotCard.svelte";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { sendDateWarning } from "./invoice/date-warnings";
  import LineItemsTable from "./invoice/LineItemsTable.svelte";
  import PdfErrorNotice from "./invoice/PdfErrorNotice.svelte";
  import { INVALID_ROUTE_ID_MESSAGE, parseRouteId } from "./invoice/route-id";
  import TextSection from "./invoice/TextSection.svelte";
  import { canReopenOffer } from "./offer/offer-actions";
  import { OFFER_STATUS_LABEL, OFFER_STATUS_VARIANT } from "./offer/status";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  type BusyTask = "action" | "pdf" | "convert";

  let offer = $state<Offer | null>(null);
  let items = $state<OfferItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  // One flag for every mutating action, so status changes, PDF generation and conversion never overlap.
  let busyTask = $state<BusyTask | null>(null);
  const busy = $derived(busyTask !== null);
  const generating = $derived(busyTask === "pdf");
  const converting = $derived(busyTask === "convert");
  let loadToken = 0;
  let lastPdfPath = $state<string | null>(null);
  let pdfError = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);
  let confirmAcceptOpen = $state(false);
  let confirmRejectOpen = $state(false);
  let sendDialogOpen = $state(false);
  let sendDate = $state(toIsoDate(nowUnix()));
  let convertedInvoiceNumber = $state<string | null>(null);

  const customer = $derived(offer ? parseCustomerSnapshot(offer.customerSnapshot) : null);
  const awaitsConversion = $derived(offer?.status === "accepted" && !offer.convertedInvoiceId);
  const sendWarning = $derived(
    offer && sendDate ? sendDateWarning(fromIsoDate(sendDate), offer.issueDate, nowUnix()) : null,
  );

  $effect(() => {
    void params?.id;
    load();
  });

  async function load() {
    const offerId = parseRouteId(params?.id);
    if (offerId === null) {
      offer = null;
      error = INVALID_ROUTE_ID_MESSAGE;
      loading = false;
      return;
    }
    const token = ++loadToken;
    // Reloading the offer that is already shown keeps the page (scroll, dialogs) in place.
    if (offer?.id !== offerId) {
      loading = true;
      pdfError = null;
    }
    error = null;
    try {
      const res = await getOffer(offerId);
      if (token !== loadToken) return;
      if (!res) {
        offer = null;
        error = "Angebot nicht gefunden.";
        return;
      }
      const linkedInvoiceNumber = await findConvertedInvoiceNumber(res.offer);
      if (token !== loadToken) return;
      offer = res.offer;
      items = res.items;
      lastPdfPath = res.offer.pdfPath;
      convertedInvoiceNumber = linkedInvoiceNumber;
    } catch (e) {
      if (token === loadToken) {
        if (offer?.id !== offerId) offer = null;
        error = String(e);
      }
    } finally {
      if (token === loadToken) loading = false;
    }
  }

  async function findConvertedInvoiceNumber(source: Offer): Promise<string | null> {
    if (!source.convertedInvoiceId) return null;
    try {
      const converted = await getInvoice(source.convertedInvoiceId);
      return converted ? displayInvoiceNumber(converted.invoice) : null;
    } catch (e) {
      toast.error("Verknüpfte Rechnung konnte nicht geladen werden", String(e));
      return null;
    }
  }

  async function runExclusive(task: BusyTask, fn: () => Promise<void>) {
    if (busyTask) return;
    busyTask = task;
    try {
      await fn();
    } finally {
      busyTask = null;
    }
  }

  async function action(label: string, fn: () => Promise<void>) {
    await runExclusive("action", async () => {
      error = null;
      try {
        await fn();
        await load();
        toast.success(label);
      } catch (e) {
        error = String(e);
        toast.error("Aktion fehlgeschlagen", String(e));
      }
    });
  }

  function openSendDialog() {
    sendDate = toIsoDate(nowUnix());
    sendDialogOpen = true;
  }

  async function confirmSend() {
    if (!offer || busy) return;
    const { id } = offer;
    const sentAt = fromIsoDate(sendDate);
    sendDialogOpen = false;
    await action("Als versendet markiert", () => markSent(id, sentAt));
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
    const { id } = offer;
    await runExclusive("pdf", async () => {
      pdfError = null;
      try {
        const res = await generateOfferPdf(id);
        if (res.success) {
          lastPdfPath = res.pdfPath;
          toast.action("PDF erstellt", { label: "Öffnen", onClick: () => openPath(res.pdfPath) });
        } else {
          pdfError = `${res.error.code}: ${res.error.message}`;
          toast.error("PDF-Generierung fehlgeschlagen", res.error.message);
        }
      } catch (e) {
        pdfError = String(e);
        toast.error("PDF-Generierung fehlgeschlagen", String(e));
      }
    });
  }

  async function usePdfFile(open: (path: string) => Promise<void>) {
    if (!lastPdfPath) return;
    try {
      await open(lastPdfPath);
    } catch (e) {
      pdfError = String(e);
    }
  }

  async function onConvert() {
    if (!offer) return;
    const { id } = offer;
    await runExclusive("convert", async () => {
      try {
        const newId = await convertToInvoice(id);
        const created = await getInvoice(newId);
        const label = created ? displayInvoiceNumber(created.invoice) : `#${newId}`;
        toast.success(`Rechnung ${label} erstellt — bitte Daten prüfen`);
        push(`/invoices/${newId}/edit`);
      } catch (e) {
        toast.error("Umwandlung fehlgeschlagen", String(e));
      }
    });
  }
</script>

<header class="mb-6">
  <BackLink href="/offers">Angebote</BackLink>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error && !offer}
  <p class="text-sm text-destructive">{error}</p>
{:else if offer && !customer}
  <p class="text-sm text-destructive">{UNREADABLE_SNAPSHOT_MESSAGE}</p>
{:else if offer && customer}
  <div class="flex flex-col @3xl:flex-row @3xl:items-start @3xl:justify-between gap-4 mb-6">
    <div class="min-w-0">
      <div class="flex items-center gap-3">
        <h1 class="text-3xl font-semibold tracking-tight font-mono">{offer.number}</h1>
        <Badge variant={OFFER_STATUS_VARIANT[offer.status]}>{OFFER_STATUS_LABEL[offer.status]}</Badge>
      </div>
      <p class="text-sm text-muted-foreground mt-1.5">
        {customer.name} · {formatDate(offer.issueDate)}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if awaitsConversion}
        <Button disabled={busy} onclick={onConvert}>
          <FileSignature />
          {converting ? "Erzeuge…" : "In Rechnung umwandeln"}
        </Button>
      {/if}

      <Button disabled={busy} onclick={onGeneratePdf} variant={awaitsConversion ? "outline" : "default"}>
        <FileDown />
        {generating ? "Erzeuge…" : lastPdfPath ? "PDF neu erzeugen" : "PDF erzeugen"}
      </Button>

      {#if lastPdfPath}
        <Button variant="outline" onclick={() => usePdfFile(openPath)}>
          <FileText />
          Öffnen
        </Button>
        <Button
          variant="outline"
          size="icon"
          onclick={() => usePdfFile(revealItemInDir)}
          aria-label="Im Explorer zeigen"
        >
          <FolderOpen />
        </Button>
      {/if}

      {#if offer.status === "draft"}
        <Button variant="outline" onclick={() => push(`/offers/${offer!.id}/edit`)}>
          <Pencil />
          Bearbeiten
        </Button>
        <Button disabled={busy} onclick={openSendDialog}>
          <Send />
          Versenden
        </Button>
      {/if}
      {#if offer.status === "sent"}
        <Button disabled={busy} onclick={() => (confirmAcceptOpen = true)}>
          <CheckCircle2 />
          Angenommen
        </Button>
        <Button variant="outline" disabled={busy} onclick={() => (confirmRejectOpen = true)}>
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

        {#if canReopenOffer(offer)}
          <DropdownItem disabled={busy} onSelect={() => action("Zurück zu Entwurf", () => reopenDraft(offer!.id))}>
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
    <PdfErrorNotice message={pdfError} />
  {:else if lastPdfPath}
    <p class="text-xs text-muted-foreground mb-4 font-mono">PDF: {lastPdfPath}</p>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <CustomerSnapshotCard {customer} />

    <Card>
      <CardContent>
        <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">Eckdaten</h2>
        <dl class="text-sm grid grid-cols-2 gap-y-1.5">
          <dt class="text-muted-foreground">Angebotsdatum</dt>
          <dd>{formatDate(offer.issueDate)}</dd>
          <dt class="text-muted-foreground">Gültig bis</dt>
          <dd>{formatDate(offer.validUntil)}</dd>
          {#if offer.servicePeriodStart && offer.servicePeriodEnd}
            <dt class="text-muted-foreground">Leistungszeitraum</dt>
            <dd>{formatDate(offer.servicePeriodStart)} – {formatDate(offer.servicePeriodEnd)}</dd>
          {/if}
          {#if offer.isReverseCharge}
            <dt class="text-muted-foreground">Art des Umsatzes</dt>
            <dd>{SUPPLY_KIND_LABEL[offer.supplyKind]}</dd>
          {/if}
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
    <TextSection title="Einleitung" text={offer.introText} />
  {/if}

  <LineItemsTable
    {items}
    currency={offer.currency}
    showVat={!offer.isKleinunternehmer}
    subtotal={offer.subtotal}
    vatAmount={offer.vatAmount}
    total={offer.total}
  />

  {#if offer.notes}
    <TextSection title="Notizen" text={offer.notes} />
  {/if}

  <ConfirmDialog
    bind:open={confirmDeleteOpen}
    title="Angebot löschen?"
    description={`${offer.number} wird unwiderruflich entfernt.`}
    confirmLabel="Löschen"
    destructive
    onConfirm={performDelete}
  />

  <ConfirmDialog
    bind:open={confirmAcceptOpen}
    title="Angebot als angenommen markieren?"
    description={`${offer.number} gilt danach als angenommen und kann in eine Rechnung umgewandelt werden.`}
    confirmLabel="Angenommen"
    onConfirm={() => action("Als angenommen markiert", () => markAccepted(offer!.id))}
  />

  <ConfirmDialog
    bind:open={confirmRejectOpen}
    title="Angebot als abgelehnt markieren?"
    description={`${offer.number} gilt danach als abgelehnt und kann nicht in eine Rechnung umgewandelt werden.`}
    confirmLabel="Abgelehnt"
    destructive
    onConfirm={() => action("Als abgelehnt markiert", () => markRejected(offer!.id))}
  />

  <DateConfirmDialog
    bind:open={sendDialogOpen}
    bind:date={sendDate}
    title="Als versendet markieren"
    description="Das Versanddatum wird im Angebot festgehalten."
    dateInputId="offer-send-date"
    dateLabel="Versanddatum"
    hint="Standard ist heute. Für Nacherfassung das tatsächliche Versanddatum eintragen."
    confirmLabel="Versenden"
    warning={sendWarning}
    {busy}
    onConfirm={confirmSend}
  />
{/if}
