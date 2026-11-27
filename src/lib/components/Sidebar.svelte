<script lang="ts">
  import { link, router } from "svelte-spa-router";
  import { Search } from "$lib/brand-icons";
  import { NAV_GROUPS, SETTINGS_NAV_ITEM, isNavItemActive, type NavItem } from "$lib/navigation";
  import { cn } from "$lib/utils";
  import { isMac } from "$lib/utils/platform";
  import TenantSwitcher from "./TenantSwitcher.svelte";
  import logo from "../../assets/brand/horizontal-on-dark.svg";

  type Props = { onOpenSearch: () => void };
  let { onOpenSearch }: Props = $props();

  const searchShortcut = isMac ? "⌘K" : "Strg K";
</script>

{#snippet navLink(item: NavItem)}
  {@const active = isNavItemActive(item, router.location)}
  <a
    href={item.href}
    use:link
    aria-current={active ? "page" : undefined}
    class={cn(
      "relative flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 font-semibold transition-colors",
      "before:absolute before:-left-2.5 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-coral before:transition-opacity",
      active
        ? "bg-sidebar-active text-sidebar-foreground before:opacity-100"
        : "text-sidebar-muted before:opacity-0 hover:bg-sidebar-hover hover:text-sidebar-foreground",
    )}
  >
    <item.icon class="size-4 shrink-0" />
    {item.label}
  </a>
{/snippet}

<aside class="flex min-h-0 w-[244px] shrink-0 flex-col bg-sidebar px-2.5 pt-3.5 pb-2.5 text-sidebar-foreground">
  <a href="/" use:link class="block px-2 pt-1 pb-3.5" aria-label="Zettel – Übersicht">
    <img src={logo} alt="Zettel" class="block w-[116px]" draggable="false" />
  </a>
  <button
    type="button"
    onclick={onOpenSearch}
    aria-label="Globale Suche ({searchShortcut})"
    class="flex h-[34px] w-full items-center gap-2 rounded-md border border-sidebar-line bg-sidebar-hover px-2.5 text-[13px] text-sidebar-muted transition-colors hover:text-sidebar-foreground"
  >
    <Search class="size-4 shrink-0" />
    <span class="flex-1 text-left">Suchen oder anlegen</span>
    <kbd class="text-[10.5px] font-bold opacity-75">{searchShortcut}</kbd>
  </button>

  <!-- Safety net for windows below the designed height; the footer stays pinned. The negative margin keeps the active bar, which sits outside the link, from being clipped. -->
  <nav aria-label="Hauptnavigation" class="-mx-2.5 mt-3.5 flex min-h-0 flex-1 flex-col overflow-y-auto px-2.5">
    {#each NAV_GROUPS as group (group.label ?? "root")}
      <div role="group" aria-label={group.label ?? undefined} class="flex flex-col">
        {#if group.label}
          <div class="px-2.5 pt-3.5 pb-[5px] text-[11.5px] font-bold text-sidebar-muted opacity-70">
            {group.label}
          </div>
        {/if}
        {#each group.items as item (item.href)}
          {@render navLink(item)}
        {/each}
      </div>
    {/each}
  </nav>

  <div class="border-t border-sidebar-line pt-2.5">
    <nav aria-label="System" class="mb-1.5 flex flex-col">
      {@render navLink(SETTINGS_NAV_ITEM)}
    </nav>
    <TenantSwitcher />
  </div>
</aside>
