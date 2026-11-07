<script lang="ts">
  import type { Snippet } from "svelte";
  import { PageHeader } from "$lib/ui";
  import BackLink from "../parts/entity/BackLink.svelte";

  interface Props {
    title: string;
    description?: string;
    actions?: Snippet;
    children: Snippet;
  }

  const { title, description, actions, children }: Props = $props();
</script>

{#snippet backLink()}
  <BackLink href="/settings">Einstellungen</BackLink>
{/snippet}

{#snippet actionsRow()}
  <div class="flex items-center gap-2">
    {@render actions?.()}
  </div>
{/snippet}

<PageHeader {title} subtitle={description} back={backLink} actions={actions ? actionsRow : undefined} />

{@render children()}
