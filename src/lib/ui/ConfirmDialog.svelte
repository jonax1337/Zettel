<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./Button.svelte";
  import { createDismissalTracker } from "./dismissal";

  type Props = {
    open?: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
  };

  let {
    open = $bindable(false),
    title,
    description,
    confirmLabel = "Bestätigen",
    cancelLabel = "Abbrechen",
    destructive = false,
    onConfirm,
    onCancel,
  }: Props = $props();

  let working = $state(false);

  // onCancel also covers Escape and outside clicks, not only the cancel button.
  const dismissal = createDismissalTracker(() => onCancel?.());
  $effect(() => dismissal.sync(open));

  async function handleConfirm() {
    working = true;
    // Before onConfirm runs: it may already close the dialog (e.g. by navigating).
    dismissal.markConfirmed();
    try {
      await onConfirm();
      open = false;
    } catch (e) {
      dismissal.unmarkConfirmed();
      throw e;
    } finally {
      working = false;
    }
  }
</script>

<Dialog bind:open {title} {description}>
  {#snippet footer()}
    <Button
      variant="outline"
      onclick={() => (open = false)}
      disabled={working}
    >
      {cancelLabel}
    </Button>
    <Button
      variant={destructive ? "destructive" : "default"}
      onclick={handleConfirm}
      disabled={working}
    >
      {confirmLabel}
    </Button>
  {/snippet}
</Dialog>
