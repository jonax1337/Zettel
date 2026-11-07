<script lang="ts">
  type Props = {
    loading: boolean;
    error: string | null;
    hasDocument: boolean;
    /** The document loaded, but its customer snapshot could not be parsed. */
    unreadable: boolean;
    unreadableMessage: string;
  };
  let { loading, error, hasDocument, unreadable, unreadableMessage }: Props = $props();
</script>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if error && !hasDocument}
  <p class="text-sm text-destructive">{error}</p>
{:else if hasDocument && unreadable}
  <p class="text-sm text-destructive">{unreadableMessage}</p>
{/if}
