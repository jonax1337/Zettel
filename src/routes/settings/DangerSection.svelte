<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    description: Snippet;
    children: Snippet;
  };
  let { title, description, children }: Props = $props();
</script>

<div class="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
  <div>
    <h3 class="text-sm font-semibold">{title}</h3>
    <p class="text-xs text-muted-foreground mt-0.5">
      {@render description()}
    </p>
  </div>
  {@render children()}
</div>
