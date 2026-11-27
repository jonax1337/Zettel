<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="grid grid-cols-2 items-start gap-x-4 gap-y-3.5">
  {@render children()}
</div>
