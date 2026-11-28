<script lang="ts">
  import type { Snippet } from "svelte";
  import { link } from "svelte-spa-router";
  import { ArrowLeft } from "$lib/brand-icons";
  import { BACK_LINK_CLASS } from "$lib/ui/PageHeader.svelte";

  type Props = {
    href: string;
    children: Snippet;
  };
  let { href, children }: Props = $props();
</script>

<a {href} use:link class={BACK_LINK_CLASS}>
  <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
  {@render children()}
</a>
