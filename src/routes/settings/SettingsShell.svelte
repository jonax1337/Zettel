<script lang="ts">
  import { push } from "svelte-spa-router";
  import { ChevronLeft } from "@lucide/svelte";
  import { Button } from "$lib/ui";
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    description?: string;
    children: Snippet;
  }

  const { title, description, children }: Props = $props();
</script>

<div class="container mx-auto max-w-4xl space-y-8 py-10">
  <div class="space-y-3">
    <Button
      variant="ghost"
      size="sm"
      class="-ml-2 h-8 px-2 text-muted-foreground hover:text-foreground"
      onclick={() => push("/settings")}
    >
      <ChevronLeft class="size-4" />
      Einstellungen
    </Button>
    <div class="space-y-1">
      <h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
      {#if description}
        <p class="text-sm text-muted-foreground">{description}</p>
      {/if}
    </div>
  </div>

  {@render children()}
</div>
