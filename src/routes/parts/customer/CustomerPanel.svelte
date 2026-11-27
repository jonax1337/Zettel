<script lang="ts">
  import type { Snippet } from "svelte";
  import { Card } from "$lib/ui";

  type Props = {
    title: string;
    children: Snippet;
  };
  let { title, children }: Props = $props();
</script>

<Card class="gap-3 px-[18px] py-4">
  <h3 class="text-sm font-extrabold">{title}</h3>
  {@render children()}
</Card>
