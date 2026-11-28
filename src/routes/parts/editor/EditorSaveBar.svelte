<script lang="ts">
  import { Button, SaveBar } from "$lib/ui";

  type Props = {
    submitLabel: string;
    saving: boolean;
    /** For pages without a form: the button then saves on click instead of submitting. */
    onSave?: () => void;
    /** The form cannot be saved, e.g. a sent offer. */
    disabled?: boolean;
    /** Message of the failed save or the first validation problem. */
    error?: string | null;
    onCancel: () => void;
    /** The document total, shown on the right. */
    total?: string;
    totalLabel?: string;
  };
  let {
    submitLabel,
    saving,
    onSave,
    disabled = false,
    error = null,
    onCancel,
    total,
    totalLabel = "Gesamtbetrag",
  }: Props = $props();
</script>

<SaveBar>
  <Button type={onSave ? "button" : "submit"} onclick={onSave} disabled={saving || disabled}>
    {saving ? "Speichere…" : submitLabel}
  </Button>
  <Button type="button" variant="outline" onclick={onCancel}>Abbrechen</Button>
  {#if error}
    <span role="alert" title={error} class="line-clamp-2 min-w-0 text-sm text-destructive">{error}</span>
  {/if}
  {#if total}
    <span class="ml-auto flex shrink-0 items-baseline gap-2 whitespace-nowrap tabular-nums text-muted-foreground">
      {totalLabel}
      <b class="font-display text-lg font-extrabold text-foreground">{total}</b>
    </span>
  {/if}
</SaveBar>
