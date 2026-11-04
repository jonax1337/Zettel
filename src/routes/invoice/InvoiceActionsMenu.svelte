<script lang="ts">
  import { push } from "svelte-spa-router";
  import { DropdownItem, DropdownMenu, DropdownSeparator, MoreActionsTrigger } from "$lib/ui";
  import { Ban, FileWarning, Pencil, Repeat, Trash2, Undo2 } from "$lib/brand-icons";
  import type { Invoice, ReminderLevel } from "$lib/db/schema";
  import { REMINDER_CREATE_LABEL } from "./reminder-levels";

  type Props = {
    invoice: Invoice;
    /** Level of the reminder that can be created next, or null when none can. */
    creatableReminderLevel: ReminderLevel | null;
    canCreateCreditNote: boolean;
    creatingCreditNote: boolean;
    onReopenDraft: () => void;
    onCancelInvoice: () => void;
    onRequestCreditNote: () => void;
    onRequestDelete: () => void;
  };
  let {
    invoice,
    creatableReminderLevel,
    canCreateCreditNote,
    creatingCreditNote,
    onReopenDraft,
    onCancelInvoice,
    onRequestCreditNote,
    onRequestDelete,
  }: Props = $props();

  const canCancel = $derived(invoice.status !== "cancelled" && invoice.status !== "paid");
  const canDelete = $derived(invoice.status === "draft" || invoice.status === "cancelled");
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
    <DropdownItem disabled={creatingCreditNote} onSelect={onRequestCreditNote}>
      <Ban /> Stornorechnung erstellen
    </DropdownItem>
  {/if}
  {#if !invoice.isCreditNote}
    <DropdownItem onSelect={() => push(`/recurring/new?fromInvoice=${invoice.id}`)}>
      <Repeat /> Als Vorlage speichern
    </DropdownItem>
  {/if}
  {#if invoice.status === "sent"}
    <DropdownSeparator />
    <DropdownItem onSelect={onReopenDraft}>
      <Undo2 /> Zurück zu Entwurf
    </DropdownItem>
  {/if}
  {#if canCancel}
    <DropdownItem onSelect={onCancelInvoice}>
      <Ban /> Stornieren
    </DropdownItem>
  {/if}
  {#if canDelete}
    <DropdownSeparator />
    <DropdownItem destructive onSelect={onRequestDelete}>
      <Trash2 /> Löschen
    </DropdownItem>
  {/if}
</DropdownMenu>
