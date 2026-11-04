<script lang="ts">
  import type { Snippet } from "svelte";
  import { link } from "svelte-spa-router";
  import { ArrowLeft } from "$lib/brand-icons";

  type Props = {
    href: string;
    children: Snippet;
  };
  let { href, children }: Props = $props();
</script>

<a
  {href}
  use:link
  class="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
>
  <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
  {@render children()}
</a>
