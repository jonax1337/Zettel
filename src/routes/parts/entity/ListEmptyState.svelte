<script lang="ts">
  import { EmptyState } from "$lib/ui";

  type Props = {
    /** Filters hide existing rows: offer to reset them instead of creating a record. */
    filtered: boolean;
    /** Without it the filtered state offers no action; lists without filters leave it out. */
    onResetFilters?: () => void;
    filteredMessage?: string;
    emptyMessage: string;
    /** Call to action of the empty (unfiltered) state; shown together with `onCreate`. */
    createLabel?: string;
    onCreate?: () => void;
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

<!-- The page header already carries the one filled button, so the call to action is an outline. -->
{#if filtered}
  <EmptyState
    variant="no-results"
    message={filteredMessage}
    actionLabel="Filter zurücksetzen"
    onAction={onResetFilters}
    actionVariant="outline"
  />
{:else}
  <EmptyState message={emptyMessage} actionLabel={createLabel} onAction={onCreate} actionVariant="outline" />
{/if}
