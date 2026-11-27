<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { refreshOverdueCount } from "$lib/overdue-count.svelte";
  import { Badge, Button, ConfirmDialog, DatePicker, Dialog, Input, Label, toast, Panel } from "$lib/ui";
  import { Trash2 } from "$lib/brand-icons";
  import type { Invoice, InvoicePayment } from "$lib/db/schema";
  import { canRemovePayment, openBalanceCent } from "$lib/db/invoice-lifecycle";
  import { addPayment, deletePayment } from "$lib/db/invoice-payments";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { eurStringToCents } from "$lib/utils/money";
  import { centsToPriceText } from "../parts/entity/format";

  type Props = {
    invoice: Invoice;
    /** What issued credit notes take off the invoice; it is no longer owed. */
    creditedCent: number;
    payments: InvoicePayment[];
    canAddPayment: boolean;
    /** Called after a payment was added or removed, so the parent can reload. */
    onChanged: () => Promise<void>;
  };
  let { invoice, creditedCent, payments, canAddPayment, onChanged }: Props = $props();

  let dialogOpen = $state(false);
  let paidAtIso = $state(toIsoDate(nowUnix()));
  let amountText = $state("");
  let notes = $state("");
  let busy = $state(false);
  let removeOpen = $state(false);
  let paymentToRemove = $state<InvoicePayment | null>(null);
  let removing = $state(false);

  const totalCent = $derived(Math.abs(invoice.total));
  const paidCent = $derived(invoice.amountPaidCent ?? 0);
  const remainingCent = $derived(Math.max(0, openBalanceCent({ ...invoice, creditedCent })));
  const dueCent = $derived(Math.max(0, totalCent - creditedCent));
  const paidShare = $derived(dueCent > 0 ? Math.min(100, Math.round((paidCent / dueCent) * 100)) : paidCent > 0 ? 100 : 0);
  const removable = $derived(canRemovePayment({ ...invoice, creditedCent }, payments.length));
  const headline = $derived(
    remainingCent > 0
      ? `${formatMoney(remainingCent, invoice.currency)} offen`
      : invoice.status === "paid"
        ? "Vollständig bezahlt"
        : "Nichts offen",
  );
  const showsFigures = $derived(paidCent > 0 || creditedCent > 0);

  /** Opens the dialog with the open amount filled in; the header's main action calls this. */
  export function openDialog() {
    paidAtIso = toIsoDate(nowUnix());
    amountText = centsToPriceText(remainingCent);
    notes = "";
    dialogOpen = true;
  }

  async function confirmAdd() {
    if (busy) return;
    const amountCent = eurStringToCents(amountText);
    if (amountCent <= 0) {
      toast.error("Betrag ungültig", "Bitte einen positiven Betrag eintragen.");
      return;
    }
    busy = true;
    try {
      await addPayment({
        invoiceId: invoice.id,
        paidAt: fromIsoDate(paidAtIso),
        amountCent,
        source: "manual",
        notes: notes.trim() || null,
      });
      dialogOpen = false;
      void refreshOverdueCount();
      await onChanged();
      toast.success("Zahlung erfasst");
    } catch (e) {
      toast.error("Erfassen fehlgeschlagen", errorMessage(e));
    } finally {
      busy = false;
    }
  }

  function askToRemove(payment: InvoicePayment) {
    if (removing) return;
    paymentToRemove = payment;
    removeOpen = true;
  }

  async function confirmRemove() {
    const payment = paymentToRemove;
    if (!payment || removing) return;
    removing = true;
    try {
      await deletePayment(payment.id);
      void refreshOverdueCount();
      await onChanged();
      toast.success("Zahlung entfernt");
    } catch (e) {
      toast.error("Entfernen fehlgeschlagen", errorMessage(e));
    } finally {
      removing = false;
    }
  }
</script>

<Panel title="Zahlung">
  <div class="font-display text-[22px] leading-tight font-extrabold tabular-nums">{headline}</div>
  <div class="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Bezahlt" aria-valuenow={paidShare} aria-valuemin={0} aria-valuemax={100}>
    <div class="h-full rounded-full bg-status-ok" style="width: {paidShare}%"></div>
  </div>

  {#if showsFigures}
    <dl class="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums">
      <dt class="text-muted-foreground">Gesamt</dt>
      <dd class="text-right">{formatMoney(totalCent, invoice.currency)}</dd>
      {#if creditedCent > 0}
        <dt class="text-muted-foreground">Storniert</dt>
        <dd class="text-right">−{formatMoney(creditedCent, invoice.currency)}</dd>
      {/if}
      <dt class="text-muted-foreground">Bezahlt</dt>
      <dd class="text-right text-status-ok">{formatMoney(paidCent, invoice.currency)}</dd>
    </dl>
  {:else if canAddPayment}
    <p class="text-sm text-muted-foreground">Noch keine Zahlung erfasst.</p>
  {/if}

  {#if payments.length > 0}
    <ul class="grid gap-2 border-t border-border pt-3">
      {#each payments as p (p.id)}
        <li class="flex items-center justify-between gap-3 text-sm">
          <div class="flex min-w-0 items-center gap-2.5">
            <time class="text-xs text-muted-foreground tabular-nums">{formatDate(p.paidAt)}</time>
            <span class="font-bold tabular-nums">{formatMoney(p.amountCent, invoice.currency)}</span>
            {#if p.source !== "manual"}
              <Badge variant="calm" class="h-[18px] px-2 text-[11px]">{p.source}</Badge>
            {/if}
            {#if p.notes}
              <span class="truncate text-xs text-muted-foreground" title={p.notes}>{p.notes}</span>
            {/if}
          </div>
          {#if removable}
            <button
              type="button"
              onclick={() => askToRemove(p)}
              disabled={removing}
              class="cursor-pointer text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
              aria-label="Zahlung vom {formatDate(p.paidAt)} über {formatMoney(p.amountCent, invoice.currency)} entfernen"
            >
              <Trash2 class="size-3.5" />
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

<ConfirmDialog
  bind:open={removeOpen}
  title="Zahlung entfernen?"
  description={paymentToRemove
    ? `Die Zahlung über ${formatMoney(paymentToRemove.amountCent, invoice.currency)} vom ${formatDate(paymentToRemove.paidAt)} wird von der Rechnung entfernt. Der offene Betrag steigt entsprechend.`
    : undefined}
  confirmLabel="Entfernen"
  destructive
  onConfirm={confirmRemove}
/>

<Dialog
  bind:open={dialogOpen}
  title="Zahlung erfassen"
  description="Die Zahlung wird an der Rechnung protokolliert. Ist der volle Betrag beglichen, wird die Rechnung automatisch als bezahlt markiert."
>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <Label for="pay-date">Zahldatum</Label>
      <DatePicker id="pay-date" bind:value={paidAtIso} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="pay-amount">Betrag ({invoice.currency})</Label>
      <Input id="pay-amount" type="text" inputmode="decimal" bind:value={amountText} />
      <p class="text-xs text-muted-foreground">
        Offen: <strong>{formatMoney(remainingCent, invoice.currency)}</strong>
      </p>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="pay-notes">Notiz (optional)</Label>
      <Input id="pay-notes" bind:value={notes} placeholder="z. B. Überweisung vom 15.03., Verwendungszweck RE-2026-0001" />
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (dialogOpen = false)} disabled={busy}>Abbrechen</Button>
    <Button onclick={confirmAdd} disabled={busy}>{busy ? "Erfasse…" : "Erfassen"}</Button>
  {/snippet}
</Dialog>
