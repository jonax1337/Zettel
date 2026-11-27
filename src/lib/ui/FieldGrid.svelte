<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  let { children, class: klass }: { children: Snippet; class?: string } = $props();
</script>

<div class={cn("grid grid-cols-2 items-start gap-x-4 gap-y-3.5", klass)}>
  {@render children()}
</div>
