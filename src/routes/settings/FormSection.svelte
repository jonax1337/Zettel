<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    description?: string;
    children: Snippet;
  };
  let { title, description, children }: Props = $props();
</script>

<!-- Sections are separated by a hairline; the first one of a page has none. -->
<section class="mt-6 border-t pt-5 first-of-type:mt-0 first-of-type:border-t-0 first-of-type:pt-0">
  {#if title}
    <h3 class="text-sm">{title}</h3>
  {/if}
  {#if description}
    <p class="mt-1 text-[13px] text-muted-foreground">{description}</p>
  {/if}
  <div class={title || description ? "mt-3.5" : ""}>
    {@render children()}
  </div>
</section>
