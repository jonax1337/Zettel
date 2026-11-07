<script lang="ts">
  import type { Snippet } from "svelte";
  import { Card, CardContent } from "$lib/ui";

  let { children }: { children: Snippet } = $props();
</script>

<Card>
  <CardContent>
    <h2 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-3">Eckdaten</h2>
    <dl class="text-sm grid grid-cols-2 gap-y-1.5">
      {@render children()}
    </dl>
  </CardContent>
</Card>
