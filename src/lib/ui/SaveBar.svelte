<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children?: Snippet } = $props();
</script>

<!-- The negative margins cancel the page container's padding (px-7, from 1181px px-10, and pb-24 in Layout), so the bar spans the content width and sits flush at the bottom. -->
<div
  class="sticky bottom-0 z-10 -mx-7 -mb-24 mt-7 flex items-center gap-2.5 border-t border-input bg-background px-7 py-3 min-[1181px]:-mx-10 min-[1181px]:px-10"
>
  {@render children?.()}
</div>
