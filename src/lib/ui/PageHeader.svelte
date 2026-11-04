<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    subtitle?: string;
    actions?: Snippet;
  };

  let { title, subtitle, actions }: Props = $props();
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
    {#if subtitle}
      <p class="text-sm text-muted-foreground mt-1">{subtitle}</p>
    {/if}
  </div>
  {@render actions?.()}
</header>
