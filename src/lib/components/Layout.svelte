<script lang="ts">
  import { link, router } from "svelte-spa-router";
  import {
    LayoutDashboard,
    Users,
    FileText,
    FileSignature,
    Repeat,
    Download,
    Settings as SettingsIcon,
    Monitor,
    Sun,
    Moon,
  } from "@lucide/svelte";
  import { Toaster, DropdownMenu, DropdownItem, Titlebar } from "$lib/ui";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import { cn } from "$lib/utils";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onMount } from "svelte";
  import { version as appVersion } from "../../../package.json";

  let { children } = $props();

  let windowTitle = $state("Zettel");

  onMount(() => {
    getCurrentWindow()
      .title()
      .then((t) => (windowTitle = t));
  });

  const nav = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/customers", label: "Kunden", icon: Users },
    { href: "/offers", label: "Angebote", icon: FileSignature },
    { href: "/invoices", label: "Rechnungen", icon: FileText },
    { href: "/recurring", label: "Vorlagen", icon: Repeat },
    { href: "/export", label: "Export", icon: Download },
    { href: "/settings", label: "Einstellungen", icon: SettingsIcon },
  ];

  function isActive(href: string) {
    const loc = router.location;
    if (href === "/") return loc === "/";
    return loc === href || loc.startsWith(href + "/");
  }

  const ThemeIcon = $derived(
    theme.mode === "system" ? Monitor : theme.mode === "light" ? Sun : Moon,
  );
  const themeLabel: Record<ThemeMode, string> = {
    system: "System",
    light: "Hell",
    dark: "Dunkel",
  };
</script>

<div class="flex flex-col h-full bg-background text-foreground">
  <Titlebar title={windowTitle} />

  <div class="flex flex-1 min-h-0">
    <aside class="w-60 shrink-0 border-r bg-card/50 flex flex-col">
        <nav class="flex-1 p-2 flex flex-col gap-0.5 pt-4">
          {#each nav as item}
            {@const active = isActive(item.href)}
            <a
              href={item.href}
              use:link
              class={cn(
                "group relative flex items-center gap-2.5 rounded-md px-3 h-9 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <item.icon class="size-4 shrink-0" />
              <span>{item.label}</span>
            </a>
          {/each}
        </nav>

        <div class="p-2 border-t flex items-center justify-between">
          <span class="px-2 text-[10px] text-muted-foreground">
            v{appVersion} · MIT
          </span>
          <DropdownMenu align="end" side="top">
            {#snippet trigger()}
              <button
                type="button"
                class="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Theme: {themeLabel[theme.mode]}"
              >
                <ThemeIcon class="size-4" />
              </button>
            {/snippet}
            <DropdownItem onSelect={() => theme.set("system")}>
              <Monitor class="size-4" />
              <span>System</span>
              {#if theme.mode === "system"}
                <span class="ml-auto text-xs text-muted-foreground">✓</span>
              {/if}
            </DropdownItem>
            <DropdownItem onSelect={() => theme.set("light")}>
              <Sun class="size-4" />
              <span>Hell</span>
              {#if theme.mode === "light"}
                <span class="ml-auto text-xs text-muted-foreground">✓</span>
              {/if}
            </DropdownItem>
            <DropdownItem onSelect={() => theme.set("dark")}>
              <Moon class="size-4" />
              <span>Dunkel</span>
              {#if theme.mode === "dark"}
                <span class="ml-auto text-xs text-muted-foreground">✓</span>
              {/if}
            </DropdownItem>
          </DropdownMenu>
        </div>
      </aside>

    <main class="flex-1 overflow-auto">
      <div class="mx-auto max-w-6xl px-8 py-8">
        {@render children?.()}
      </div>
    </main>
  </div>
</div>

<Toaster />
