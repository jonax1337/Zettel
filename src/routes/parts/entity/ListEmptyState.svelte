<script lang="ts">
  import { EmptyState } from "$lib/ui";

  type Props = {
    /** Filters hide existing rows: offer to reset them instead of creating a record. */
    filtered: boolean;
    onResetFilters: () => void;
    filteredMessage?: string;
    emptyMessage: string;
    createLabel: string;
    onCreate: () => void;
  };
  let {
    filtered,
    onResetFilters,
    filteredMessage = "Keine Treffer.",
    emptyMessage,
    createLabel,
    onCreate,
  }: Props = $props();
</script>

{#if filtered}
  <EmptyState
    variant="no-results"
    message={filteredMessage}
    actionLabel="Filter zurücksetzen"
    onAction={onResetFilters}
  />
{:else}
  <EmptyState message={emptyMessage} actionLabel={createLabel} onAction={onCreate} />
{/if}
