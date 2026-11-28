<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    /** Period controls on the left. */
    children: Snippet;
    /** Export and similar actions on the right. */
    actions?: Snippet;
  };

  let { children, actions }: Props = $props();
</script>

<div class="mb-4 flex flex-wrap items-center gap-2">
  {@render children()}
  {#if actions}
    <div class="ml-auto flex flex-wrap items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
