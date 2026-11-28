<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = {
    title?: string;
    description?: string;
    /** Sits right of the heading, e.g. buttons that add rows. */
    actions?: Snippet;
    /** Heading level: 2 for form pages, 3 where a page title already is the h2 (settings). */
    level?: 2 | 3;
    children: Snippet;
    class?: string;
  };
  let { title, description, actions, level = 2, children, class: klass }: Props = $props();
</script>

<!-- Sections are separated by a hairline; the first one of a form has none. -->
<section class={cn("mt-6 border-t pt-5 first-of-type:mt-0 first-of-type:border-t-0 first-of-type:pt-0", klass)}>
  {#if title || description || actions}
    <div class="mb-3.5 flex items-start gap-3">
      <div class="min-w-0">
        {#if title}
          <svelte:element this={`h${level}`} class={level === 3 ? "text-sm" : undefined}>{title}</svelte:element>
        {/if}
        {#if description}
          <p class="mt-1 text-[13px] text-muted-foreground">{description}</p>
        {/if}
      </div>
      {#if actions}
        <div class="ml-auto flex flex-none flex-wrap items-center gap-2">{@render actions()}</div>
      {/if}
    </div>
  {/if}
  {@render children()}
</section>
