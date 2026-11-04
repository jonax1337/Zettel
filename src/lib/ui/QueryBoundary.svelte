<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** A `createQueryState` result (or anything with its loading/error flags). */
    query: { loading: boolean; error: string | null };
    /** Show `empty` instead of the content once the query succeeded. */
    isEmpty?: boolean;
    empty?: Snippet;
    children: Snippet;
  };

  let { query, isEmpty = false, empty, children }: Props = $props();
</script>

{#if query.error}
  <p class="text-sm text-destructive">Fehler: {query.error}</p>
{:else if query.loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else if isEmpty && empty}
  {@render empty()}
{:else}
  {@render children()}
{/if}
