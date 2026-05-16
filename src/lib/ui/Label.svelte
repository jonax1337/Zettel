<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLLabelAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLLabelAttributes & { class?: string; children?: Snippet };
  let { class: klass, children, ...rest }: Props = $props();
</script>

<label
  class={cn(
    "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
    klass,
  )}
  {...rest}
>
  {@render children?.()}
</label>
