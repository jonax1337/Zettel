<script lang="ts">
  import Dialog from "./Dialog.svelte";
  import Button from "./Button.svelte";

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

  async function handleConfirm() {
    working = true;
    try {
      await onConfirm();
      open = false;
    } finally {
      working = false;
    }
  }
</script>

<Dialog bind:open {title} {description}>
  {#snippet footer()}
    <Button
      variant="outline"
      onclick={() => {
        onCancel?.();
        open = false;
      }}
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
