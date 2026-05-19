<script lang="ts">
  import { push } from "svelte-spa-router";
  import { ArrowLeft } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    description?: string;
    actions?: Snippet;
    children: Snippet;
  }

  const { title, description, actions, children }: Props = $props();
</script>

<button
  type="button"
  class="group mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
  onclick={() => push("/settings")}
>
  <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
  Einstellungen
</button>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
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
