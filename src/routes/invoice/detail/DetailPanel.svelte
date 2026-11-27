<script lang="ts">
  import type { Snippet } from "svelte";
  import { Card } from "$lib/ui";

  type Props = {
    title: string;
    /** Small link or note on the right of the title. */
    aside?: Snippet;
    children: Snippet;
  };
  let { title, aside, children }: Props = $props();
</script>

<Card class="gap-3 px-[18px] py-4">
  <h3 class="flex items-center gap-2 text-sm font-extrabold">
    {title}
    {#if aside}
      <span class="ml-auto font-sans text-[13px] font-semibold text-muted-foreground">{@render aside()}</span>
    {/if}
  </h3>
  {@render children()}
</Card>
