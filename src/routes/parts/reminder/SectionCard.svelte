<script lang="ts">
  import type { Snippet } from "svelte";
  import { Card } from "$lib/ui";

  type Props = {
    title: string;
    class?: string;
    children: Snippet;
  };
  let { title, class: klass, children }: Props = $props();
</script>

<Card class={klass}>
  <div class="p-5 flex flex-col gap-4">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
    {@render children()}
  </div>
</Card>
