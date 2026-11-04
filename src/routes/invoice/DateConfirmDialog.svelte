<script lang="ts">
  import { Button, DatePicker, Dialog, Label } from "$lib/ui";
  import { AlertTriangle } from "$lib/brand-icons";

  type Props = {
    open: boolean;
    date: string;
    title: string;
    description: string;
    dateInputId: string;
    dateLabel: string;
    hint: string;
    confirmLabel: string;
    warning: string | null;
    /** Blocks confirming while another action on the page is still running. */
    busy?: boolean;
    onConfirm: () => void;
  };
  let {
    open = $bindable(),
    date = $bindable(),
    title,
    description,
    dateInputId,
    dateLabel,
    hint,
    confirmLabel,
    warning,
    busy = false,
    onConfirm,
  }: Props = $props();
</script>

<Dialog bind:open {title} {description}>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <Label for={dateInputId}>{dateLabel}</Label>
      <DatePicker id={dateInputId} bind:value={date} />
      <p class="text-xs text-muted-foreground">{hint}</p>
      {#if warning}
        <p class="text-xs text-warning flex items-center gap-1">
          <AlertTriangle class="size-3.5" /> {warning}
        </p>
      {/if}
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)}>Abbrechen</Button>
    <Button onclick={onConfirm} disabled={!date || busy}>{confirmLabel}</Button>
  {/snippet}
</Dialog>
