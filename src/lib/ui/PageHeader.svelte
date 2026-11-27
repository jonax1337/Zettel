<script lang="ts" module>
  /** Shared by PageHeader's back link and the route-level BackLink. */
  export const BACK_LINK_CLASS =
    "group mb-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { link } from "svelte-spa-router";
  import { ArrowLeft } from "$lib/brand-icons";

  type Props = {
    title: string;
    subtitle?: string;
    /** Link above the title; a snippet when the link needs custom content. */
    back?: Snippet | { href: string; label: string };
    actions?: Snippet;
  };

  let { title, subtitle, back, actions }: Props = $props();
</script>

<header class="mb-5 flex items-start gap-4">
  <div class="min-w-0">
    {#if typeof back === "function"}
      {@render back()}
    {:else if back}
      <a href={back.href} use:link class={BACK_LINK_CLASS}>
        <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
        {back.label}
      </a>
    {/if}
    <h1>{title}</h1>
    {#if subtitle}
      <p class="mt-1 text-muted-foreground">{subtitle}</p>
    {/if}
  </div>
  {#if actions}
    <div class="ml-auto flex flex-none flex-wrap items-center gap-2">
      {@render actions()}
    </div>
  {/if}
</header>
