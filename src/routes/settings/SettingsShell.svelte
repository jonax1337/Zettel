<script lang="ts">
  import { push } from "svelte-spa-router";
  import { ArrowLeft } from "$lib/brand-icons";
  import type { Snippet } from "svelte";
  import { PageHeader } from "$lib/ui";

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

{#snippet actionsRow()}
  <div class="flex items-center gap-2">
    {@render actions?.()}
  </div>
{/snippet}

<PageHeader {title} subtitle={description} actions={actions ? actionsRow : undefined} />

{@render children()}
