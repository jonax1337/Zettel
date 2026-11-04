<script lang="ts">
  import { link, push } from "svelte-spa-router";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { createDocumentActions } from "./parts/entity/document-actions.svelte";
  import DocumentFactsCard from "./parts/entity/DocumentFactsCard.svelte";
  import DocumentLoadMessage from "./parts/entity/DocumentLoadMessage.svelte";
  import FactRow from "./parts/entity/FactRow.svelte";
  import PdfLocation from "./parts/entity/PdfLocation.svelte";
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
  import { getInvoice } from "$lib/db/invoices";
  import type { Offer, OfferItem } from "$lib/db/schema";
  import { formatDate } from "$lib/utils/date";
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
    MoreActionsTrigger,
    toast,
  } from "$lib/ui";
  import { CheckCircle2, FileSignature, Pencil, Send, Trash2, Undo2, XCircle } from "$lib/brand-icons";
  import { parseCustomerSnapshot, UNREADABLE_SNAPSHOT_MESSAGE } from "./invoice/customer-snapshot";
  import CustomerSnapshotCard from "./invoice/CustomerSnapshotCard.svelte";
  import InvoicePdfActions from "./invoice/InvoicePdfActions.svelte";
  import LineItemsTable from "./invoice/LineItemsTable.svelte";
  import PdfErrorNotice from "./invoice/PdfErrorNotice.svelte";
  import { INVALID_ROUTE_ID_MESSAGE, parseRouteId } from "./invoice/route-id";
  import TextSection from "./invoice/TextSection.svelte";
  import { OFFER_STATUS_LABEL, OFFER_STATUS_VARIANT } from "./offer/status";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let offer = $state<Offer | null>(null);
  let items = $state<OfferItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let converting = $state(false);
  let lastPdfPath = $state<string | null>(null);
  let confirmDeleteOpen = $state(false);
  let convertedInvoiceNumber = $state<string | null>(null);

  const actions = createDocumentActions({ reload: load });

  const customer = $derived(offer ? parseCustomerSnapshot(offer.customerSnapshot) : null);
  const awaitsConversion = $derived(offer?.status === "accepted" && !offer.convertedInvoiceId);

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
    loading = true;
    error = null;
    try {
      const res = await getOffer(offerId);
      if (!res) {
        offer = null;
        error = "Angebot nicht gefunden.";
        return;
      }
      offer = res.offer;
      items = res.items;
      lastPdfPath = res.offer.pdfPath;
      convertedInvoiceNumber = await findConvertedInvoiceNumber(res.offer);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  async function findConvertedInvoiceNumber(source: Offer): Promise<string | null> {
    if (!source.convertedInvoiceId) return null;
    try {
      const converted = await getInvoice(source.convertedInvoiceId);
      return converted?.invoice.number ?? null;
    } catch (e) {
      toast.error("Verknüpfte Rechnung konnte nicht geladen werden", String(e));
      return null;
    }
  }

  async function performDelete() {
    if (!offer) return;
    const { id } = offer;
    await actions.remove({
      remove: () => deleteOffer(id),
      deletedLabel: "Angebot gelöscht",
      redirectTo: "/offers",
    });
  }

  async function onGeneratePdf() {
    if (!offer) return;
    const { id } = offer;
    await actions.generatePdf(
      () => generateOfferPdf(id),
      async ({ pdfPath }) => {
        lastPdfPath = pdfPath;
        toast.success("PDF erstellt");
        await openPath(pdfPath);
      },
    );
  }

  async function onConvert() {
    if (!offer) return;
    converting = true;
    try {
      const newId = await convertToInvoice(offer.id);
      const created = await getInvoice(newId);
      toast.success(`Rechnung ${created?.invoice.number ?? `#${newId}`} erstellt — bitte Daten prüfen`);
      push(`/invoices/${newId}/edit`);
    } catch (e) {
      toast.error("Umwandlung fehlgeschlagen", String(e));
    } finally {
      converting = false;
    }
  }
</script>

<header class="mb-6">
  <BackLink href="/offers">Angebote</BackLink>
</header>

<DocumentLoadMessage
  {loading}
  {error}
  hasDocument={!!offer}
  unreadable={!customer}
  unreadableMessage={UNREADABLE_SNAPSHOT_MESSAGE}
/>

{#if !loading && offer && customer}
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
        <Button disabled={converting} onclick={onConvert}>
          <FileSignature />
          {converting ? "Erzeuge…" : "In Rechnung umwandeln"}
        </Button>
      {/if}

      <InvoicePdfActions
        hasPdf={!!lastPdfPath}
        generating={actions.generating}
        generateVariant={awaitsConversion ? "outline" : "default"}
        onGenerate={onGeneratePdf}
        onOpen={() => actions.usePdfFile(lastPdfPath, openPath)}
        onReveal={() => actions.usePdfFile(lastPdfPath, revealItemInDir)}
      />

      {#if offer.status === "draft"}
        <Button variant="outline" onclick={() => push(`/offers/${offer!.id}/edit`)}>
          <Pencil />
          Bearbeiten
        </Button>
        <Button disabled={actions.busy} onclick={() => actions.run("Als versendet markiert", () => markSent(offer!.id))}>
          <Send />
          Versenden
        </Button>
      {/if}
      {#if offer.status === "sent"}
        <Button
          disabled={actions.busy}
          onclick={() => actions.run("Als angenommen markiert", () => markAccepted(offer!.id))}
        >
          <CheckCircle2 />
          Angenommen
        </Button>
        <Button
          variant="outline"
          disabled={actions.busy}
          onclick={() => actions.run("Als abgelehnt markiert", () => markRejected(offer!.id))}
        >
          <XCircle />
          Abgelehnt
        </Button>
      {/if}

      <DropdownMenu>
        {#snippet trigger()}
          <MoreActionsTrigger />
        {/snippet}

        {#if offer.status === "sent" || offer.status === "rejected" || offer.status === "expired"}
          <DropdownItem onSelect={() => actions.run("Zurück zu Entwurf", () => reopenDraft(offer!.id))}>
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

  {#if actions.pdfError}
    <PdfErrorNotice message={actions.pdfError} />
  {:else if lastPdfPath}
    <PdfLocation path={lastPdfPath} />
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <CustomerSnapshotCard {customer} />

    <DocumentFactsCard>
      <FactRow label="Angebotsdatum">{formatDate(offer.issueDate)}</FactRow>
      <FactRow label="Gültig bis">{formatDate(offer.validUntil)}</FactRow>
      {#if offer.servicePeriodStart && offer.servicePeriodEnd}
        <FactRow label="Leistungszeitraum">
          {formatDate(offer.servicePeriodStart)} – {formatDate(offer.servicePeriodEnd)}
        </FactRow>
      {/if}
      {#if offer.isReverseCharge}
        <FactRow label="Art des Umsatzes">{SUPPLY_KIND_LABEL[offer.supplyKind]}</FactRow>
      {/if}
      {#if offer.sentAt}
        <FactRow label="Versendet">{formatDate(offer.sentAt)}</FactRow>
      {/if}
      {#if offer.acceptedAt}
        <FactRow label="Angenommen">{formatDate(offer.acceptedAt)}</FactRow>
      {/if}
      {#if offer.rejectedAt}
        <FactRow label="Abgelehnt">{formatDate(offer.rejectedAt)}</FactRow>
      {/if}
    </DocumentFactsCard>
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
{/if}
