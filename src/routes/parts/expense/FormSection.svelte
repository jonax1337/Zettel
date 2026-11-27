<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    description?: string;
    /** Sits right of the heading, e.g. buttons that add rows. */
    actions?: Snippet;
    children: Snippet;
    class?: string;
  };
  let { title, description, actions, children, class: klass = "" }: Props = $props();
</script>

<section class="border-t border-border py-6 first:border-t-0 first:pt-0 {klass}">
  <div class="mb-4 flex items-start gap-3">
    <div class="min-w-0">
      <h2 class="font-display text-base font-extrabold">{title}</h2>
      {#if description}
        <p class="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      {/if}
    </div>
    {#if actions}
      <div class="ml-auto flex flex-none flex-wrap items-center gap-2">{@render actions()}</div>
    {/if}
  </div>
  {@render children()}
</section>
