<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";
  type Props = { class?: string; children?: Snippet };
  let { class: klass, children }: Props = $props();
</script>

<div class={cn("px-6", klass)}>
  {@render children?.()}
</div>
