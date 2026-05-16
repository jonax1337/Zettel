<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";
  type Props = { class?: string; children?: Snippet };
  let { class: klass, children }: Props = $props();
</script>

<p class={cn("text-muted-foreground text-sm", klass)}>
  {@render children?.()}
</p>
