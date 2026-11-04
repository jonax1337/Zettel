<script lang="ts">
  import type { Snippet } from "svelte";
  import BackLink from "../parts/entity/BackLink.svelte";

  interface Props {
    title: string;
    description?: string;
    actions?: Snippet;
    children: Snippet;
  }

  const { title, description, actions, children }: Props = $props();
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <BackLink href="/settings">Einstellungen</BackLink>
    <h1 class="text-3xl font-semibold tracking-tight mt-2">{title}</h1>
    {#if description}
      <p class="text-sm text-muted-foreground mt-1">{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="flex items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</header>

{@render children()}
