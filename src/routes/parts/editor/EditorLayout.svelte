<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    paper: Snippet;
    rail: Snippet;
  };
  let { paper, rail }: Props = $props();
</script>

<!-- From 1321px the panels sit beside the sheet, below that they follow it in two columns. -->
<div class="grid items-start gap-7 min-[1321px]:grid-cols-[minmax(0,1fr)_320px]">
  <div class="min-w-0">
    {@render paper()}
  </div>
  <aside aria-label="Weitere Angaben" class="grid grid-cols-2 items-start gap-3.5 min-[1321px]:grid-cols-1">
    {@render rail()}
  </aside>
</div>
