<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";
  type Props = { class?: string; children?: Snippet };
  let { class: klass, children }: Props = $props();
</script>

<div
  class={cn(
    "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-[data-slot=card-action]:grid-cols-[1fr_auto]",
    klass,
  )}
>
  {@render children?.()}
</div>
