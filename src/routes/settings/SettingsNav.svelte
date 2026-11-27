<script lang="ts">
  import { link } from "svelte-spa-router";
  import { SETTINGS_PAGES, type SettingsPageHref } from "$lib/navigation";
  import { cn } from "$lib/utils";

  let { active }: { active: SettingsPageHref } = $props();
</script>

<!-- A sticky column on wide windows, a wrapping row above the page on narrow ones. -->
<nav
  aria-label="Einstellungen"
  class="flex flex-wrap gap-0.5 @3xl:sticky @3xl:top-6 @3xl:grid @3xl:self-start"
>
  {#each SETTINGS_PAGES as page, index (page.href)}
    {#if index > 0 && page.group !== SETTINGS_PAGES[index - 1].group}
      <div
        role="separator"
        class="mx-1.5 my-auto h-5 w-px bg-border @3xl:mx-0 @3xl:my-2 @3xl:h-px @3xl:w-auto"
      ></div>
    {/if}
    {@const current = page.href === active}
    <a
      href={page.href}
      use:link
      aria-current={current ? "page" : undefined}
      class={cn(
        "inline-flex h-[34px] items-center rounded-lg px-3 font-bold transition-colors",
        current
          ? "bg-surface-strong text-foreground"
          : "text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
    >
      {page.label}
    </a>
  {/each}
</nav>
