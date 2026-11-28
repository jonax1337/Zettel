<script lang="ts" module>
  /** Shared by PageHeader's back link and the route-level BackLink. */
  export const BACK_LINK_CLASS =
    "group mb-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { link } from "svelte-spa-router";
  import { ArrowLeft } from "$lib/brand-icons";
  import { cn } from "$lib/utils";

  type Props = {
    title: string;
    /** A plain text, or a snippet when the line carries links or figures. */
    subtitle?: string | Snippet;
    /** Link above the title; a snippet when the link needs custom content. */
    back?: Snippet | { href: string; label: string };
    /** Status badges next to the title; they drop below it when the title leaves no room. */
    badges?: Snippet;
    /** A mark in front of title and subtitle, e.g. an avatar. */
    lead?: Snippet;
    actions?: Snippet;
    /** The actions stay beside the title while the bare title fits; badges and subtitle wrap first. Below that the actions form their own row. */
    wrap?: boolean;
  };

  let { title, subtitle, back, badges, lead, actions, wrap = false }: Props = $props();
</script>

<header class={cn("mb-5 flex items-start gap-4", wrap && "flex-wrap gap-y-3")}>
  <!-- Wrapping: no min-w-0, so the title's own width is the least this block takes before the actions move down. -->
  <div class={wrap ? "flex-1" : "min-w-0"}>
    {#if typeof back === "function"}
      {@render back()}
    {:else if back}
      <a href={back.href} use:link class={BACK_LINK_CLASS}>
        <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
        {back.label}
      </a>
    {/if}
    <div class={cn(lead && "flex items-center gap-3.5")}>
      {@render lead?.()}
      <div class="min-w-0">
        {#if badges}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 class="whitespace-nowrap">{title}</h1>
            {@render badges()}
          </div>
        {:else}
          <h1>{title}</h1>
        {/if}
        {#if subtitle}
          <!-- In a wrapping header the subtitle takes the width that is left instead of claiming its own: a long customer name must not push the actions down. -->
          <p class={cn("mt-1 text-muted-foreground", wrap && "w-0 min-w-full")}>
            {#if typeof subtitle === "function"}{@render subtitle()}{:else}{subtitle}{/if}
          </p>
        {/if}
      </div>
    </div>
  </div>
  {#if actions}
    <div class={cn("ml-auto flex flex-none flex-wrap items-center gap-2", wrap && "max-w-full")}>
      {@render actions()}
    </div>
  {/if}
</header>
