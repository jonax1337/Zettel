<script lang="ts">
  import { Badge, Button, Card, CardContent, DatePicker, Dialog, Input, Label, toast } from "$lib/ui";
  import { Plus, Trash2 } from "$lib/brand-icons";
  import type { Invoice, InvoicePayment } from "$lib/db/schema";
  import { addPayment, deletePayment } from "$lib/db/invoice-payments";
  import { formatMoney } from "$lib/utils/currency";
  import { formatDate, fromIsoDate, nowUnix, toIsoDate } from "$lib/utils/date";
  import { eurStringToCents } from "$lib/utils/money";
  import { centsToPriceText } from "../parts/entity/format";

  type Props = {
    invoice: Invoice;
    payments: InvoicePayment[];
    /** Called after a payment was added or removed, so the parent can reload. */
    onChanged: () => Promise<void>;
  };
  let { invoice, payments, onChanged }: Props = $props();

  let dialogOpen = $state(false);
  let paidAtIso = $state(toIsoDate(nowUnix()));
  let amountText = $state("");
  let notes = $state("");
  let busy = $state(false);

  const totalCent = $derived(Math.abs(invoice.total));
  const paidCent = $derived(invoice.amountPaidCent ?? 0);
  const remainingCent = $derived(Math.max(0, totalCent - paidCent));
  const canAddPayment = $derived(invoice.status !== "paid" && !invoice.isCreditNote);
  const canRemovePayment = $derived(invoice.status !== "paid" || payments.length > 1);

  function openDialog() {
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
      await onChanged();
      toast.success("Zahlung erfasst");
    } catch (e) {
      toast.error("Erfassen fehlgeschlagen", String(e));
    } finally {
      busy = false;
    }
  }

  async function remove(payment: InvoicePayment) {
    try {
      await deletePayment(payment.id);
      await onChanged();
      toast.success("Zahlung entfernt");
    } catch (e) {
      toast.error("Entfernen fehlgeschlagen", String(e));
    }
  }
</script>

<Card class="mb-6">
  <CardContent>
    <div class="flex items-center justify-between gap-3 mb-3">
      <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Zahlungen</h3>
      {#if canAddPayment}
        <Button size="sm" variant="outline" onclick={openDialog}>
          <Plus class="size-3.5" />
          Zahlung erfassen
        </Button>
      {/if}
    </div>

    <div class="grid grid-cols-3 gap-4 mb-3 text-sm">
      <div>
        <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
        <div class="font-medium tabular-nums">{formatMoney(totalCent, invoice.currency)}</div>
      </div>
      <div>
        <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Bezahlt</div>
        <div class="font-medium tabular-nums text-success">{formatMoney(paidCent, invoice.currency)}</div>
      </div>
      <div>
        <div class="text-[10px] text-muted-foreground uppercase tracking-wider">Offen</div>
        <div class="font-medium tabular-nums {remainingCent > 0 ? 'text-warning' : ''}">
          {formatMoney(remainingCent, invoice.currency)}
        </div>
      </div>
    </div>

    {#if payments.length > 0}
      <div class="border-t pt-3 space-y-2">
        {#each payments as p (p.id)}
          <div class="flex items-center justify-between gap-3 text-sm">
            <div class="flex items-center gap-3">
              <span class="text-muted-foreground tabular-nums text-xs">{formatDate(p.paidAt)}</span>
              <span class="tabular-nums font-medium">{formatMoney(p.amountCent, invoice.currency)}</span>
              {#if p.source !== "manual"}
                <Badge variant="secondary" class="text-[10px]">{p.source}</Badge>
              {/if}
              {#if p.notes}
                <span class="text-xs text-muted-foreground truncate">{p.notes}</span>
              {/if}
            </div>
            {#if canRemovePayment}
              <button
                type="button"
                onclick={() => remove(p)}
                class="text-xs text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Zahlung entfernen"
              >
                <Trash2 class="size-3.5" />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </CardContent>
</Card>

<Dialog
  bind:open={dialogOpen}
  title="Zahlung erfassen"
  description="Wird als invoice_payments-Eintrag protokolliert. Voller Saldo → Rechnung wird automatisch als bezahlt markiert."
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
      <Input id="pay-notes" bind:value={notes} placeholder="z. B. Banküberweisung von Customer X" />
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (dialogOpen = false)} disabled={busy}>Abbrechen</Button>
    <Button onclick={confirmAdd} disabled={busy}>{busy ? "Erfasse…" : "Erfassen"}</Button>
  {/snippet}
</Dialog>
