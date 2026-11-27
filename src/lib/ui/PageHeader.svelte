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
    actions?: Snippet;
    /** Lets the actions form their own row below the title on narrow widths instead of squeezing it. */
    wrap?: boolean;
  };

  let { title, subtitle, back, badges, actions, wrap = false }: Props = $props();
</script>

<header class={cn("mb-5 flex items-start gap-4", wrap && "flex-wrap gap-y-3")}>
  <div class="min-w-0">
    {#if typeof back === "function"}
      {@render back()}
    {:else if back}
      <a href={back.href} use:link class={BACK_LINK_CLASS}>
        <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
        {back.label}
      </a>
    {/if}
    {#if badges}
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 class="whitespace-nowrap">{title}</h1>
        {@render badges()}
      </div>
    {:else}
      <h1>{title}</h1>
    {/if}
    {#if subtitle}
      <p class="mt-1 text-muted-foreground">
        {#if typeof subtitle === "function"}{@render subtitle()}{:else}{subtitle}{/if}
      </p>
    {/if}
  </div>
  {#if actions}
    <div class={cn("ml-auto flex flex-none flex-wrap items-center gap-2", wrap && "max-w-full")}>
      {@render actions()}
    </div>
  {/if}
</header>
