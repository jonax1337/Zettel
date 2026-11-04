<script lang="ts">
  import { link, router } from "svelte-spa-router";
  import { Search } from "$lib/brand-icons";
  import { NAV_GROUPS } from "$lib/navigation";
  import { cn } from "$lib/utils";
  import { isMac } from "$lib/utils/platform";
  import { theme } from "$lib/theme.svelte";
  import TenantSwitcher from "./TenantSwitcher.svelte";
  import logoLight from "../../assets/brand/horizontal-primary.svg";
  import logoDark from "../../assets/brand/horizontal-on-dark.svg";

  type Props = { onOpenSearch: () => void };
  let { onOpenSearch }: Props = $props();

  const searchShortcut = isMac ? "⌘K" : "Strg K";

  function isActive(href: string): boolean {
    const location = router.location;
    if (href === "/") return location === "/";
    return location === href || location.startsWith(href + "/");
  }
</script>

<aside class="w-60 shrink-0 border-r bg-card/50 flex flex-col">
  <a href="/" use:link class="block px-5 pt-5 pb-1" aria-label="Zettel – Dashboard">
    <img
      src={theme.resolved === "dark" ? logoDark : logoLight}
      alt="Zettel"
      class="w-40 h-auto"
      draggable="false"
    />
  </a>
  <div class="px-2 pt-4">
    <button
      type="button"
      onclick={onOpenSearch}
      aria-label="Globale Suche ({searchShortcut})"
      class="flex w-full items-center gap-2.5 h-9 px-3 rounded-md border bg-background text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      <Search class="size-4 shrink-0" />
      <span class="flex-1 text-left">Suchen…</span>
      <kbd class="text-[10px] font-bold opacity-70">{searchShortcut}</kbd>
    </button>
  </div>
  <nav class="flex-1 p-2 flex flex-col gap-4 pt-4 overflow-y-auto">
    {#each NAV_GROUPS as group (group.label ?? "root")}
      <div class="flex flex-col gap-0.5">
        {#if group.label}
          <div class="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80">
            {group.label}
          </div>
        {/if}
        {#each group.items as item (item.href)}
          {@const active = isActive(item.href)}
          <a
            href={item.href}
            use:link
            class={cn(
              "group relative flex items-center gap-2.5 rounded-md px-3 h-9 text-sm font-semibold transition-all duration-200",
              "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:rounded-r-full before:bg-primary before:transition-all before:duration-300",
              active
                ? "bg-accent text-accent-foreground before:h-5 before:opacity-100"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground before:h-0 before:opacity-0",
            )}
          >
            <item.icon class={cn("size-4 shrink-0 transition-transform duration-200", active && "scale-110")} />
            <span class="truncate" title={item.label}>{item.label}</span>
          </a>
        {/each}
      </div>
    {/each}
  </nav>

  <TenantSwitcher />
</aside>
