<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter und Suche">
  {@render children()}
</div>
