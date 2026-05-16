<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";
  type Props = { class?: string; children?: Snippet };
  let { class: klass, children }: Props = $props();
</script>

<h3 class={cn("leading-none font-semibold tracking-tight", klass)}>
  {@render children?.()}
</h3>
