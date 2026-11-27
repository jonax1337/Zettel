<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, children }: { label: string; children: Snippet } = $props();
</script>

<dt class="text-muted-foreground">{label}</dt>
<dd class="text-right">{@render children()}</dd>
