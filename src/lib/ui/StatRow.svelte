<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children?: Snippet } = $props();
</script>

<div class="mb-5.5 flex border-y border-t-input">
  {@render children?.()}
</div>
