<script lang="ts">
  import { push } from "svelte-spa-router";
  import { DropdownItem, DropdownMenu, DropdownSeparator, MoreActionsTrigger } from "$lib/ui";
  import { Ban, FileWarning, Pencil, Repeat, Trash2, Undo2 } from "$lib/brand-icons";
  import type { Invoice, ReminderLevel } from "$lib/db/schema";
  import { canDiscardInvoice } from "./invoice-actions";
  import { REMINDER_CREATE_LABEL } from "./reminder-levels";

  type Props = {
    invoice: Invoice;
    /** Level of the reminder that can be created next, or null when none can. */
    creatableReminderLevel: ReminderLevel | null;
    canCreateCreditNote: boolean;
    canReopenDraft: boolean;
    busy: boolean;
    onRequestReopenDraft: () => void;
    onRequestCancel: () => void;
    onRequestCreditNote: () => void;
    onRequestDelete: () => void;
  };
  let {
    invoice,
    creatableReminderLevel,
    canCreateCreditNote,
    canReopenDraft,
    busy,
    onRequestReopenDraft,
    onRequestCancel,
    onRequestCreditNote,
    onRequestDelete,
  }: Props = $props();

  const canDiscard = $derived(canDiscardInvoice(invoice));
</script>

<DropdownMenu>
  {#snippet trigger()}
    <MoreActionsTrigger />
  {/snippet}

  {#if invoice.status === "draft"}
    <DropdownItem onSelect={() => push(`/invoices/${invoice.id}/edit`)}>
      <Pencil /> Bearbeiten
    </DropdownItem>
  {/if}
  {#if creatableReminderLevel}
    <DropdownItem onSelect={() => push(`/reminders/new/${invoice.id}/${creatableReminderLevel}`)}>
      <FileWarning />
      {REMINDER_CREATE_LABEL[creatableReminderLevel]}
    </DropdownItem>
  {/if}
  {#if canCreateCreditNote}
    <DropdownItem disabled={busy} onSelect={onRequestCreditNote}>
      <Ban /> Stornorechnung erstellen
    </DropdownItem>
  {/if}
  {#if !invoice.isCreditNote}
    <DropdownItem onSelect={() => push(`/recurring/new?fromInvoice=${invoice.id}`)}>
      <Repeat /> Als Vorlage speichern
    </DropdownItem>
  {/if}
  {#if canReopenDraft}
    <DropdownSeparator />
    <DropdownItem disabled={busy} onSelect={onRequestReopenDraft}>
      <Undo2 /> Zurück zu Entwurf
    </DropdownItem>
  {/if}
  {#if canDiscard}
    <DropdownItem disabled={busy} onSelect={onRequestCancel}>
      <Ban /> Stornieren
    </DropdownItem>
    <DropdownSeparator />
    <DropdownItem destructive disabled={busy} onSelect={onRequestDelete}>
      <Trash2 /> Löschen
    </DropdownItem>
  {/if}
</DropdownMenu>
