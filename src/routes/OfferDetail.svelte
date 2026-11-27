<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { link, push } from "svelte-spa-router";
  import BackLink from "./parts/entity/BackLink.svelte";
  import { createDocumentActions } from "./parts/entity/document-actions.svelte";
  import DocumentFactsCard from "./parts/entity/DocumentFactsCard.svelte";
  import DocumentLoadMessage from "./parts/entity/DocumentLoadMessage.svelte";
  import MailSendButton from "./parts/entity/MailSendButton.svelte";
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
  import { fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { generateOfferPdf } from "$lib/sidecar/offer";
  import { renderOfferSheet } from "$lib/sidecar/preview";
  import { ensureCompanyDataComplete } from "$lib/utils/company-guard";
  import { resolveCustomerEmail, sendDocumentByMail } from "$lib/mail/send";
  import { Button, Card, ConfirmDialog, PageHeader, StatusBadge, toast } from "$lib/ui";
  import DocumentSheet from "$lib/components/DocumentSheet.svelte";
  import { Check, CheckCircle2, FileSignature, Pencil, XCircle } from "$lib/brand-icons";
  import { parseCustomerSnapshot, UNREADABLE_SNAPSHOT_MESSAGE } from "./invoice/customer-snapshot";
  import DateConfirmDialog from "./invoice/DateConfirmDialog.svelte";
  import { sendDateWarning } from "./invoice/date-warnings";
  import InvoicePdfActions from "./invoice/InvoicePdfActions.svelte";
  import PdfErrorNotice from "./invoice/PdfErrorNotice.svelte";
  import { INVALID_ROUTE_ID_MESSAGE, parseRouteId } from "./invoice/route-id";
  import TextSection from "./invoice/TextSection.svelte";
  import { actionsAt, buttonActions } from "./invoice/detail/action-plan";
  import DocumentActionsMenu from "./invoice/detail/DocumentActionsMenu.svelte";
  import { offerFacts, offerSheetDates } from "./invoice/detail/document-facts";
  import { offerDateNote } from "./invoice/detail/document-note";
  import FilesPanel from "./invoice/detail/FilesPanel.svelte";
  import { offerMenuEntries } from "./invoice/detail/offer-menu";
  import { offerProgressSteps } from "./invoice/detail/progress-steps";
  import ProgressSteps from "./invoice/detail/ProgressSteps.svelte";
  import { offerSheetKey } from "./invoice/detail/sheet-key";
  import { createSheetLoader } from "./invoice/detail/sheet-loader.svelte";
  import SheetFallback from "./invoice/detail/SheetFallback.svelte";
  import { type OfferActionId, planOfferActions } from "./offer/offer-actions";
  import { OFFER_STATUS } from "./offer/status";
  import { formatMoney } from "$lib/utils/currency";

  type Props = { params?: { id?: string } };
  let { params }: Props = $props();

  let offer = $state<Offer | null>(null);
  let items = $state<OfferItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let loadToken = 0;
  let lastPdfPath = $state<string | null>(null);
  let customerEmail = $state<string | null>(null);
  // The mail program keeps the hand-off call open until its message window is closed.
  let mailing = $state(false);
  let mounted = true;
  onDestroy(() => (mounted = false));
  let confirmMarkSentAfterMailOpen = $state(false);
  let confirmDeleteOpen = $state(false);
  let confirmAcceptOpen = $state(false);
  let confirmRejectOpen = $state(false);
  let sendDialogOpen = $state(false);
  let sendDate = $state(toIsoDate(nowUnix()));
  let convertedInvoiceNumber = $state<string | null>(null);

  const actions = createDocumentActions({ reload: load });
  const sheet = createSheetLoader(renderOfferSheet);
  const converting = $derived(actions.task === "convert");

  const customer = $derived(offer ? parseCustomerSnapshot(offer.customerSnapshot) : null);
  const plan = $derived(
    offer
      ? planOfferActions({
          status: offer.status,
          convertedInvoiceId: offer.convertedInvoiceId,
          hasPdf: !!lastPdfPath,
        })
      : [],
  );
  const buttonIds = $derived(buttonActions(plan));
  const menuEntries = $derived(
    offerMenuEntries(actionsAt(plan, "menu"), { busy: actions.busy, onSelect: selectMenuAction }),
  );
  const steps = $derived(
    offer
      ? offerProgressSteps({
          status: offer.status,
          sentAt: offer.sentAt,
          acceptedAt: offer.acceptedAt,
          rejectedAt: offer.rejectedAt,
          validUntil: offer.validUntil,
          converted: !!offer.convertedInvoiceId,
        })
      : [],
  );
  const sendWarning = $derived(
    offer && sendDate ? sendDateWarning(fromIsoDate(sendDate), offer.issueDate, nowUnix()) : null,
  );

  // load() reads the loaded document before its first await; tracked, every reload would retrigger itself.
  $effect(() => {
    void params?.id;
    untrack(load);
  });

  async function load() {
    const offerId = parseRouteId(params?.id);
    if (offerId === null) {
      offer = null;
      sheet.clear();
      error = INVALID_ROUTE_ID_MESSAGE;
      loading = false;
      return;
    }
    const token = ++loadToken;
    // Reloading the offer that is already shown keeps the page (scroll, dialogs) in place.
    if (offer?.id !== offerId) {
      loading = true;
      actions.clearPdfError();
    }
    error = null;
    try {
      const res = await getOffer(offerId);
      if (token !== loadToken) return;
      if (!res) {
        offer = null;
        sheet.clear();
        error = "Angebot nicht gefunden.";
        return;
      }
      const [linkedInvoiceNumber, loadedEmail] = await Promise.all([
        findConvertedInvoiceNumber(res.offer),
        fetchCustomerEmail(res.offer),
      ]);
      if (token !== loadToken) return;
      offer = res.offer;
      items = res.items;
      lastPdfPath = res.offer.pdfPath;
      convertedInvoiceNumber = linkedInvoiceNumber;
      customerEmail = loadedEmail;
      // Every change goes through load(), so the sheet follows edits, PDFs and status changes.
      if (parseCustomerSnapshot(res.offer.customerSnapshot)) {
        void sheet.load(res.offer.id, offerSheetKey(res.offer, res.items));
      } else {
        sheet.clear();
      }
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

  function fetchCustomerEmail(source: Offer): Promise<string | null> {
    return resolveCustomerEmail(
      source.customerId,
      parseCustomerSnapshot(source.customerSnapshot)?.email ?? null,
    );
  }

  function openSendDialog() {
    sendDate = toIsoDate(nowUnix());
    sendDialogOpen = true;
  }

  async function confirmSend() {
    if (!offer || actions.busy) return;
    const { id } = offer;
    const sentAt = fromIsoDate(sendDate);
    sendDialogOpen = false;
    if (!(await ensureCompanyDataComplete())) return;
    await actions.run("Als versendet markiert", () => markSent(id, sentAt));
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

  async function createPdf(thenMail: boolean) {
    if (!offer) return;
    const { id } = offer;
    await actions.generatePdf(
      () => generateOfferPdf(id),
      async ({ pdfPath }) => {
        lastPdfPath = pdfPath;
        sheet.invalidate();
        await load();
        if (!thenMail) {
          toast.action("PDF erstellt", { label: "Öffnen", onClick: () => openPath(pdfPath) });
          return;
        }
        // Not awaited: the mail program holds the call open and must not keep the page busy.
        void sendMail(pdfPath);
      },
    );
  }

  /** A draft may have been edited since its PDF was made, so it gets a fresh one. */
  function requestMail() {
    if (!offer || actions.busy || mailing) return;
    if (lastPdfPath && offer.status !== "draft") void sendMail(lastPdfPath);
    else void createPdf(true);
  }

  async function sendMail(pdfPath: string) {
    if (!offer || !customerEmail || mailing) return;
    const sent = offer;
    mailing = true;
    try {
      const result = await sendDocumentByMail(
        "offer",
        {
          number: sent.number,
          totalCent: sent.total,
          currency: sent.currency,
          dueDate: sent.validUntil,
          customer: customer?.name ?? "",
        },
        { to: customerEmail, attachmentPath: pdfPath },
      );
      // The call returns only when the mail window closes; by then the user may have moved on.
      const stillOnThisOffer = mounted && offer?.id === sent.id;
      if (result === "handed-off" && sent.status === "draft" && stillOnThisOffer) {
        confirmMarkSentAfterMailOpen = true;
      }
    } catch (e) {
      toast.error("E-Mail konnte nicht vorbereitet werden", String(e));
    } finally {
      mailing = false;
    }
  }

  async function markSentAfterMail() {
    sendDate = toIsoDate(nowUnix());
    await confirmSend();
  }

  async function onConvert() {
    if (!offer) return;
    const { id } = offer;
    await actions.exclusive("convert", async () => {
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

  function selectMenuAction(id: OfferActionId) {
    if (!offer) return;
    switch (id) {
      case "regenerate-pdf":
        void createPdf(false);
        break;
      case "reopen-draft":
        void actions.run("Zurück zu Entwurf", () => reopenDraft(offer!.id));
        break;
      case "delete":
        confirmDeleteOpen = true;
        break;
    }
  }
</script>

{#if loading || !offer || !customer}
  <header class="mb-6">
    <BackLink href="/offers">Angebote</BackLink>
  </header>
{/if}

<DocumentLoadMessage
  {loading}
  {error}
  hasDocument={!!offer}
  unreadable={!customer}
  unreadableMessage={UNREADABLE_SNAPSHOT_MESSAGE}
/>

{#if !loading && offer && customer}
  {#snippet headerBadges()}
    {#if offer}
      <StatusBadge status={offer.status} table={OFFER_STATUS} />
    {/if}
  {/snippet}

  {#snippet headerSubtitle()}
    {#if offer && customer}
      {@const dateNote = offerDateNote(offer)}
      <a href={`/customers/${offer.customerId}`} use:link class="hover:text-foreground hover:underline">{customer.name}</a>,
      <span class="tabular-nums">{formatMoney(offer.total, offer.currency)}</span>{#if dateNote}, {dateNote}{/if}
    {/if}
  {/snippet}

  {#snippet headerButtons()}
    {#if offer}
      {#each buttonIds as id (id)}
        {#if id === "open-pdf" || id === "generate-pdf"}
          <InvoicePdfActions
            hasPdf={id === "open-pdf"}
            busy={actions.busy}
            generating={actions.generating}
            onGenerate={() => createPdf(false)}
            onOpen={() => actions.usePdfFile(lastPdfPath, openPath)}
            onReveal={() => actions.usePdfFile(lastPdfPath, revealItemInDir)}
          />
        {:else if id === "edit"}
          <Button variant="outline" disabled={actions.busy} onclick={() => push(`/offers/${offer!.id}/edit`)}>
            <Pencil />
            Bearbeiten
          </Button>
        {:else if id === "send-mail"}
          <MailSendButton email={customerEmail} busy={actions.busy} sending={mailing} onSend={requestMail} />
        {:else if id === "reject"}
          <Button variant="outline" disabled={actions.busy} onclick={() => (confirmRejectOpen = true)}>
            <XCircle />
            Abgelehnt
          </Button>
        {:else if id === "mark-sent"}
          <Button disabled={actions.busy} onclick={openSendDialog}>
            <Check />
            Als versendet markieren
          </Button>
        {:else if id === "accept"}
          <Button disabled={actions.busy} onclick={() => (confirmAcceptOpen = true)}>
            <CheckCircle2 />
            Angenommen
          </Button>
        {:else if id === "convert"}
          <Button disabled={actions.busy} onclick={onConvert}>
            <FileSignature />
            {converting ? "Erzeuge…" : "In Rechnung umwandeln"}
          </Button>
        {/if}
      {/each}
      {#if menuEntries.length > 0}
        <DocumentActionsMenu entries={menuEntries} />
      {/if}
    {/if}
  {/snippet}

  <PageHeader
    title={offer.number}
    back={{ href: "/offers", label: "Angebote" }}
    badges={headerBadges}
    subtitle={headerSubtitle}
    actions={headerButtons}
    wrap
  />

  <ProgressSteps {steps} />

  {#if offer.status === "accepted" && offer.convertedInvoiceId}
    <Card class="mb-4 flex-row items-center gap-3 border border-status-ok/40 px-4 py-3.5 text-sm">
      <CheckCircle2 class="size-5 shrink-0 text-status-ok" />
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
    </Card>
  {/if}

  {#if actions.pdfError}
    <PdfErrorNotice message={actions.pdfError} />
  {/if}

  <div class="grid items-start gap-7 min-[1321px]:grid-cols-[minmax(0,1fr)_320px]">
    <div class="min-w-0 space-y-3">
      <DocumentSheet html={sheet.html} loading={sheet.loading} error={sheet.error} title={`Angebot ${offer.number}`} />
      {#if sheet.error}
        <SheetFallback
          {customer}
          dates={offerSheetDates(offer)}
          {items}
          currency={offer.currency}
          showVat={!offer.isKleinunternehmer}
          subtotal={offer.subtotal}
          vatAmount={offer.vatAmount}
          total={offer.total}
        >
          {#snippet texts()}
            {#if offer?.introText}
              <TextSection title="Einleitung" text={offer.introText} />
            {/if}
            {#if offer?.notes}
              <TextSection title="Notizen" text={offer.notes} />
            {/if}
          {/snippet}
        </SheetFallback>
      {:else if sheet.html && offer.status !== "draft"}
        <p class="text-xs text-muted-foreground">
          Das Blatt zeigt den Stand nach den aktuellen Vorlagen. Maßgeblich ist die archivierte PDF.
        </p>
      {/if}
    </div>

    <aside aria-label="Weitere Angaben" class="grid grid-cols-2 items-start gap-3.5 min-[1321px]:grid-cols-1">
      {#if lastPdfPath}
        <FilesPanel pdfPath={lastPdfPath} versions={[]} generating={actions.generating} />
      {/if}
      <DocumentFactsCard facts={offerFacts(offer)} />
    </aside>
  </div>

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
    onConfirm={() => actions.run("Als angenommen markiert", () => markAccepted(offer!.id))}
  />

  <ConfirmDialog
    bind:open={confirmRejectOpen}
    title="Angebot als abgelehnt markieren?"
    description={`${offer.number} gilt danach als abgelehnt und kann nicht in eine Rechnung umgewandelt werden.`}
    confirmLabel="Abgelehnt"
    destructive
    onConfirm={() => actions.run("Als abgelehnt markiert", () => markRejected(offer!.id))}
  />

  <ConfirmDialog
    bind:open={confirmMarkSentAfterMailOpen}
    title="Als versendet markieren?"
    description={`${offer.number} wurde an dein Mail-Programm übergeben. Soll das Angebot jetzt als versendet gelten?`}
    confirmLabel="Als versendet markieren"
    onConfirm={markSentAfterMail}
  />

  <DateConfirmDialog
    bind:open={sendDialogOpen}
    bind:date={sendDate}
    title="Als versendet markieren"
    description="Das Versanddatum wird im Angebot festgehalten."
    dateInputId="offer-send-date"
    dateLabel="Versendet am"
    hint="Standard ist heute. Für Nacherfassung das tatsächliche Datum eintragen."
    confirmLabel="Als versendet markieren"
    warning={sendWarning}
    busy={actions.busy}
    onConfirm={confirmSend}
  />
{/if}
